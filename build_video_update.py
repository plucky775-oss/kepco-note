#!/usr/bin/env python3
"""Repack only verified 207.4 video assets over the exact 207.3 APK; never sign."""
import argparse, pathlib, copy, struct, zipfile, hashlib, json
def updated_manifest(blob):
    data=bytearray(blob); strings=[]; spans=[]; pos=8; code_updated=name_updated=False
    while pos<len(data):
        kind,header,length=struct.unpack_from('<HHI',data,pos)
        if not length: raise ValueError('Malformed manifest')
        if kind==1:
            count,_,flags,start,_=struct.unpack_from('<5I',data,pos+8)
            for i in range(count):
                offset=pos+start+struct.unpack_from('<I',data,pos+header+i*4)[0]
                if flags&256:
                    for _ in range(2):
                        size=data[offset]; offset+=1
                        if size&128: size=((size&127)<<8)|data[offset]; offset+=1
                    encoding='utf-8'; end=offset+size
                else:
                    size=struct.unpack_from('<H',data,offset)[0]; offset+=2
                    if size&32768: size=((size&32767)<<16)|struct.unpack_from('<H',data,offset)[0]; offset+=2
                    encoding='utf-16le'; end=offset+size*2
                strings.append(bytes(data[offset:end]).decode(encoding)); spans.append((offset,end,encoding))
        elif kind==0x102 and strings[struct.unpack_from('<I',data,pos+20)[0]]=='manifest':
            start,attrsize,count=struct.unpack_from('<HHH',data,pos+24)
            for i in range(count):
                offset=pos+16+start+i*attrsize
                _,name,raw=struct.unpack_from('<III',data,offset)
                value=struct.unpack_from('<I',data,offset+16)[0]
                if strings[name]=='versionCode':
                    assert value==207003, 'Unexpected base version code'
                    struct.pack_into('<I',data,offset+16,207004);code_updated=True
                elif strings[name]=='versionName':
                    index=raw if raw!=0xffffffff else value
                    assert strings[index]=='207.3', 'Unexpected base version name'
                    a,b,encoding=spans[index]; replacement='207.4'.encode(encoding)
                    assert len(replacement)==b-a
                    data[a:b]=replacement;name_updated=True
        pos+=length
    assert code_updated and name_updated
    return bytes(data)


ROOT=pathlib.Path(__file__).resolve().parent
META=json.loads((ROOT/'releases/207.4/release-info.json').read_text())
def build(base,out):
 if hashlib.sha256(base.read_bytes()).hexdigest()!=META['base_sha256']:raise ValueError('Expected the exact KEPCO-note-207.3.apk base')
 assets={}
 for name,digest in META['assets'].items():
  data=(ROOT/'update-source'/name).read_bytes()
  if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Asset hash mismatch: '+name)
  assets['assets/www/'+name]=data
 with zipfile.ZipFile(base) as source,zipfile.ZipFile(out,'w') as target:
  for info in source.infolist():
   name=info.filename
   if name.startswith('META-INF/') and (name=='META-INF/MANIFEST.MF' or name.upper().endswith(('.SF','.RSA','.DSA','.EC'))):continue
   data=assets.get(name,source.read(name))
   if name=='AndroidManifest.xml':data=updated_manifest(data)
   entry=copy.copy(info);entry.extra=b'';target.writestr(entry,data)
  for name,data in assets.items():
   if name not in source.namelist():target.writestr(name,data,compress_type=zipfile.ZIP_DEFLATED)
 with zipfile.ZipFile(base) as source,zipfile.ZipFile(out) as target:
  assert target.testzip() is None
  for name in source.namelist():
   if name not in assets and name!='AndroidManifest.xml' and name in target.namelist():assert source.read(name)==target.read(name),name
 print('Unsigned APK:',out)
 print('Run zipalign, then sign with the original private 207 key. No signing secrets are included.')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('base',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,default=pathlib.Path('KEPCO-note-207.4-UNSIGNED.apk'));args=p.parse_args();build(args.base,args.out)
