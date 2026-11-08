#!/usr/bin/env python3
"""Create a parallel-install package from the verified 107 web update.

Keep the compiled activity name and DEX unchanged. Only the application ID,
owned permission/provider identifiers, display name and version are changed.
"""
import argparse,copy,hashlib,pathlib,struct,zipfile

OLD='kr.kepconote.standalone.v100'
NEW='kr.kepconote.standalone.v207'
SOURCE_SHA256='f3648f1d2c61f42501a91dfd2bd6e74fb8e45242ebee405d0147f29b076bdd7f'

def manifest(blob):
    data=bytearray(blob);pos=8;strings=[];code=False;changes=[]
    replacements={OLD:NEW,OLD+'.androidx-startup':NEW+'.androidx-startup',
        OLD+'.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION':NEW+'.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
        'KEPCO 노트 새버전':'KEPCO 노트 독립판','107.1':'207.1'}
    while pos<len(data):
        kind,header,length=struct.unpack_from('<HHI',data,pos)
        assert length>0
        if kind==1:
            count,_,flags,start,_=struct.unpack_from('<5I',data,pos+8)
            for i in range(count):
                offset=pos+start+struct.unpack_from('<I',data,pos+header+i*4)[0]
                if flags&256:
                    for _ in range(2):
                        size=data[offset];offset+=1
                        if size&128:size=((size&127)<<8)|data[offset];offset+=1
                    encoding='utf-8';end=offset+size
                else:
                    size=struct.unpack_from('<H',data,offset)[0];offset+=2
                    assert size<32768
                    encoding='utf-16le';end=offset+size*2
                value=bytes(data[offset:end]).decode(encoding);strings.append(value)
                if value in replacements:
                    new=replacements[value].encode(encoding);assert len(new)==end-offset
                    data[offset:end]=new;changes.append(value)
        elif kind==0x102 and strings[struct.unpack_from('<I',data,pos+20)[0]]=='manifest':
            start,size,count=struct.unpack_from('<HHH',data,pos+24)
            for i in range(count):
                offset=pos+16+start+i*size;name=struct.unpack_from('<I',data,offset+4)[0]
                if strings[name]=='versionCode':
                    assert struct.unpack_from('<I',data,offset+16)[0]==107001
                    struct.pack_into('<I',data,offset+16,207001);code=True
        pos+=length
    assert code and set(changes)==set(replacements)
    return bytes(data)

def build(source,target):
    assert hashlib.sha256(source.read_bytes()).hexdigest()==SOURCE_SHA256, 'Unexpected 107 input APK'
    with zipfile.ZipFile(source) as original,zipfile.ZipFile(target,'w') as output:
        for info in original.infolist():
            name=info.filename
            if name.startswith('META-INF/') and (name=='META-INF/MANIFEST.MF' or name.upper().endswith(('.RSA','.SF','.DSA','.EC'))):continue
            content=original.read(name)
            if name=='AndroidManifest.xml':content=manifest(content)
            elif name=='resources.arsc':
                assert content.count(OLD.encode('utf-16le'))==1
                content=content.replace(OLD.encode('utf-16le'),NEW.encode('utf-16le'))
            elif name in ['assets/www/version.json','assets/www/src/app-update.js']:
                content=content.replace(b'2026.11.09.107',b'2026.11.09.207')
            entry=copy.copy(info);entry.extra=b''
            output.writestr(entry,content)
    with zipfile.ZipFile(source) as a,zipfile.ZipFile(target) as b:
        assert b.testzip() is None
        changed=[n for n in b.namelist() if a.read(n)!=b.read(n)]
        assert set(changed)=={'AndroidManifest.xml','resources.arsc','assets/www/version.json','assets/www/src/app-update.js'}
        assert a.read('classes.dex')==b.read('classes.dex')
    print('Parallel application package prepared:',target)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('input',type=pathlib.Path);parser.add_argument('output',type=pathlib.Path)
    args=parser.parse_args();build(args.input,args.output)
