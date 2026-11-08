#!/usr/bin/env python3
"""Rebuild the supplied APK with only the listed assets and version metadata."""
import argparse, copy, hashlib, json, pathlib, struct, zipfile

ROOT=pathlib.Path(__file__).resolve().parent
META=json.loads((ROOT/'validation.json').read_text())
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
                    assert value==106001, 'Unexpected base version code'
                    struct.pack_into('<I',data,offset+16,META['version_code']);code_updated=True
                elif strings[name]=='versionName':
                    index=raw if raw!=0xffffffff else value
                    assert strings[index]=='106.1', 'Unexpected base version name'
                    a,b,encoding=spans[index]; replacement=META['version_name'].encode(encoding)
                    assert len(replacement)==b-a
                    data[a:b]=replacement;name_updated=True
        pos+=length
    assert code_updated and name_updated
    return bytes(data)

def build(base,output):
    assert hashlib.sha256(base.read_bytes()).hexdigest()==META['base_sha256'], 'This patch is only for the attached (6) APK'
    replacements={}
    for item in META['changes']:
        path=item['path'];content=(ROOT/'update-source'/path.removeprefix('assets/www/')).read_bytes()
        assert hashlib.sha256(content).hexdigest()==item['sha256'], 'Changed patch file: '+path
        replacements[path]=content
    seen=set()
    with zipfile.ZipFile(base) as source, zipfile.ZipFile(output,'w') as target:
        for info in source.infolist():
            name=info.filename
            if name.startswith('META-INF/') and (name=='META-INF/MANIFEST.MF' or name.upper().endswith(('.SF','.RSA','.DSA','.EC'))):continue
            content=replacements.get(name,source.read(name))
            if name=='AndroidManifest.xml':content=updated_manifest(content)
            entry=copy.copy(info);entry.extra=b''
            if entry.compress_type==zipfile.ZIP_STORED:
                # Align resource/native data; apksigner must run after final zipalign.
                alignment=16384 if name.endswith('.so') else 4
                offset=target.fp.tell()+30+len(name.encode())
                padding=(-offset-4)%alignment
                entry.extra=struct.pack('<HH',0xd935,padding)+b'\0'*padding
            target.writestr(entry,content);seen.add(name)
        for name,content in replacements.items():
            if name not in seen:target.writestr(name,content,compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(base) as original,zipfile.ZipFile(output) as built:
        assert built.testzip() is None
        for info in original.infolist():
            name=info.filename
            if name in replacements or name=='AndroidManifest.xml' or name not in built.namelist():continue
            assert original.read(name)==built.read(name), 'Unexpected change: '+name
        for name,digest in META['unchanged_calendar_diary'].items():
            assert hashlib.sha256(built.read('assets/www/'+name)).hexdigest()==digest
    print('Unsigned APK prepared; original signing key is still required:',output)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('base_apk',type=pathlib.Path);parser.add_argument('--out',type=pathlib.Path,default=ROOT/'KEPCO-note-107-UNSIGNED.apk')
    args=parser.parse_args();build(args.base_apk,args.out)
