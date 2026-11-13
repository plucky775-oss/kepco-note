#!/usr/bin/env python3
"""Build unsigned separate-install S Pen edition; signing key is never in repo."""
import pathlib,zipfile,copy,struct,tempfile,json
from build_safety_update import build
ROOT=pathlib.Path(__file__).resolve().parent
OLD='kr.kepconote.standalone.v207';NEW='kr.kepconote.standalone.v307'
def manifest(blob):
 d=bytearray(blob);p=8;strings=[];changed=set();code=False
 replacements={OLD:NEW,OLD+'.androidx-startup':NEW+'.androidx-startup',OLD+'.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION':NEW+'.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION','207.5':'307.5','KEPCO 노트':'KEPCO S펜'}
 while p<len(d):
  k,h,l=struct.unpack_from('<HHI',d,p)
  assert l>0
  if k==1:
   n,_,f,s,_=struct.unpack_from('<5I',d,p+8)
   assert not f&256,'Only validated UTF16 manifest supported'
   for i in range(n):
    o=p+s+struct.unpack_from('<I',d,p+h+i*4)[0];size=struct.unpack_from('<H',d,o)[0];assert size<32768
    a=o+2;b=a+size*2;v=bytes(d[a:b]).decode('utf-16le');strings.append(v)
    if v in replacements:
     r=replacements[v].encode('utf-16le');assert len(r)==b-a;d[a:b]=r;changed.add(v)
  elif k==0x102 and strings[struct.unpack_from('<I',d,p+20)[0]]=='manifest':
   start,size,n=struct.unpack_from('<HHH',d,p+24)
   for i in range(n):
    o=p+16+start+i*size
    if strings[struct.unpack_from('<I',d,o+4)[0]]=='versionCode':
     assert struct.unpack_from('<I',d,o+16)[0]==207005
     struct.pack_into('<I',d,o+16,307005);code=True
  p+=l
 assert changed==set(replacements) and code
 return bytes(d)
def parallel(base,out):
 with tempfile.TemporaryDirectory() as t:
  interim=pathlib.Path(t)/'overlay.apk';build(base,interim)
  with zipfile.ZipFile(interim) as src,zipfile.ZipFile(out,'w') as dst:
   for info in src.infolist():
    data=src.read(info.filename)
    if info.filename=='AndroidManifest.xml':data=manifest(data)
    elif info.filename=='resources.arsc':
     assert data.count(OLD.encode('utf-16le'))==1
     data=data.replace(OLD.encode('utf-16le'),NEW.encode('utf-16le'))
    elif info.filename=='assets/www/version.json':data=json.dumps({'version':'2026.11.13.307.5'}).encode()
    elif info.filename=='assets/www/src/app-update.js':
     import re
     data=re.sub(rb"APP_VERSION='[^']+'",b"APP_VERSION='2026.11.13.307.5'",data)
    entry=copy.copy(info);entry.extra=b'';dst.writestr(entry,data)
 with zipfile.ZipFile(base) as a,zipfile.ZipFile(out) as b:
  assert b.testzip() is None
  assert a.read('classes.dex')==b.read('classes.dex')
 print('Separate package:',NEW,'version 307.5; original app/data are independent.')
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('base',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args();parallel(a.base,a.output)
