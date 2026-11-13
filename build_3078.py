#!/usr/bin/env python3
"""Overlay 307.8 source on exact 307.7; never sign."""
import argparse,pathlib,zipfile,hashlib,struct,copy,json
ROOT=pathlib.Path(__file__).resolve().parent
BASE_SHA='b7d76743632dc019bfd0fcd2e6cbdb401640ed2cc2ec2281bd189b946bcd0362'
def manifest(blob):
 d=bytearray(blob);strings=[];p=8;changed=set()
 while p<len(d):
  k,h,l=struct.unpack_from('<HHI',d,p);assert l>0
  if k==1:
   n,_,f,s,_=struct.unpack_from('<5I',d,p+8);assert not f&256
   for i in range(n):
    o=p+s+struct.unpack_from('<I',d,p+h+i*4)[0];size=struct.unpack_from('<H',d,o)[0];assert size<32768
    a=o+2;b=a+size*2;v=bytes(d[a:b]).decode('utf-16le');strings.append(v)
    if v=='307.7':d[a:b]='307.8'.encode('utf-16le');changed.add('name')
  elif k==0x102 and strings[struct.unpack_from('<I',d,p+20)[0]]=='manifest':
   start,size,n=struct.unpack_from('<HHH',d,p+24)
   for i in range(n):
    o=p+16+start+i*size
    if strings[struct.unpack_from('<I',d,o+4)[0]]=='versionCode':
     assert struct.unpack_from('<I',d,o+16)[0]==307007
     struct.pack_into('<I',d,o+16,307008);changed.add('code')
  p+=l
 assert changed=={'name','code'}
 return bytes(d)
def build(base,out):
 assert hashlib.sha256(base.read_bytes()).hexdigest()==BASE_SHA,'Wrong base APK'
 assets={'assets/www/'+str(p.relative_to(ROOT/'update-source')):p.read_bytes() for p in (ROOT/'update-source').rglob('*') if p.is_file()}
 assets['assets/www/version.json']=json.dumps({'version':'2026.11.13.307.8'}).encode()
 import re
 assets['assets/www/src/app-update.js']=re.sub(rb"APP_VERSION='[^']+'",b"APP_VERSION='2026.11.13.307.8'",assets['assets/www/src/app-update.js'])
 with zipfile.ZipFile(base) as src,zipfile.ZipFile(out,'w') as dst:
  for info in src.infolist():
   n=info.filename
   if n.startswith('META-INF/') and (n=='META-INF/MANIFEST.MF' or n.upper().endswith(('.SF','.RSA','.DSA','.EC'))):continue
   data=assets.get(n,src.read(n))
   if n=='AndroidManifest.xml':data=manifest(data)
   entry=copy.copy(info);entry.extra=b'';dst.writestr(entry,data)
  for n,data in assets.items():
   if n not in src.namelist():dst.writestr(n,data,compress_type=zipfile.ZIP_DEFLATED)
 with zipfile.ZipFile(base) as a,zipfile.ZipFile(out) as b:
  assert b.testzip() is None
  for n in a.namelist():
   if n not in assets and n not in ['AndroidManifest.xml'] and n in b.namelist():assert a.read(n)==b.read(n),n
 print('Built unsigned 307.8, original package/resources retained:',out)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('base',type=pathlib.Path);p.add_argument('out',type=pathlib.Path);a=p.parse_args();build(a.base,a.out)
