#!/usr/bin/env python3
"""Overlay 307.6 source and audited native DEX on exact 307.5; never sign."""
import argparse,pathlib,zipfile,hashlib,struct,copy,json
ROOT=pathlib.Path(__file__).resolve().parent
BASE_SHA='7c560c9689325bcf99f8f77a17757cca8b91aee20a64058a520dde79b024d3b7'
def manifest(blob):
 d=bytearray(blob);strings=[];p=8;changed=set()
 while p<len(d):
  k,h,l=struct.unpack_from('<HHI',d,p);assert l>0
  if k==1:
   n,_,f,s,_=struct.unpack_from('<5I',d,p+8);assert not f&256
   for i in range(n):
    o=p+s+struct.unpack_from('<I',d,p+h+i*4)[0];size=struct.unpack_from('<H',d,o)[0];assert size<32768
    a=o+2;b=a+size*2;v=bytes(d[a:b]).decode('utf-16le');strings.append(v)
    if v=='307.5':d[a:b]='307.6'.encode('utf-16le');changed.add('name')
  elif k==0x102 and strings[struct.unpack_from('<I',d,p+20)[0]]=='manifest':
   start,size,n=struct.unpack_from('<HHH',d,p+24)
   for i in range(n):
    o=p+16+start+i*size
    if strings[struct.unpack_from('<I',d,o+4)[0]]=='versionCode':
     assert struct.unpack_from('<I',d,o+16)[0]==307005
     struct.pack_into('<I',d,o+16,307006);changed.add('code')
  p+=l
 assert changed=={'name','code'}
 return bytes(d)
def build(base,dex,out):
 assert hashlib.sha256(base.read_bytes()).hexdigest()==BASE_SHA,'Wrong base APK'
 assert dex.read_bytes().startswith(b'dex\n'),'Expected compiled native DEX'
 assets={'assets/www/'+str(p.relative_to(ROOT/'update-source')):p.read_bytes() for p in (ROOT/'update-source').rglob('*') if p.is_file()}
 assets['assets/www/version.json']=json.dumps({'version':'2026.11.13.307.6'}).encode()
 import re
 assets['assets/www/src/app-update.js']=re.sub(rb"APP_VERSION='[^']+'",b"APP_VERSION='2026.11.13.307.6'",assets['assets/www/src/app-update.js'])
 with zipfile.ZipFile(base) as src,zipfile.ZipFile(out,'w') as dst:
  for info in src.infolist():
   n=info.filename
   if n.startswith('META-INF/') and (n=='META-INF/MANIFEST.MF' or n.upper().endswith(('.SF','.RSA','.DSA','.EC'))):continue
   data=assets.get(n,src.read(n))
   if n=='AndroidManifest.xml':data=manifest(data)
   if n=='classes.dex':data=dex.read_bytes()
   entry=copy.copy(info);entry.extra=b'';dst.writestr(entry,data)
  for n,data in assets.items():
   if n not in src.namelist():dst.writestr(n,data,compress_type=zipfile.ZIP_DEFLATED)
 with zipfile.ZipFile(base) as a,zipfile.ZipFile(out) as b:
  assert b.testzip() is None
  for n in a.namelist():
   if n not in assets and n not in ['AndroidManifest.xml','classes.dex'] and n in b.namelist():assert a.read(n)==b.read(n),n
 print('Built unsigned 307.6, original package/resources retained:',out)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('base',type=pathlib.Path);p.add_argument('dex',type=pathlib.Path);p.add_argument('out',type=pathlib.Path);a=p.parse_args();build(a.base,a.dex,a.out)
