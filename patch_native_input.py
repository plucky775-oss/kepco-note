#!/usr/bin/env python3
"""Surgically install the reviewed WebView subclass; output is UNSIGNED.

Does not change APK identity, permissions, signing keys or JavaScript bridges.
Use an owned private signing key after final zipalign. Tools are pinned in
native/toolchain-lock.json. No unrecognized downloads or credentials required.
"""
import argparse, copy, hashlib, json, pathlib, re, shutil, subprocess, tempfile, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parent
MAIN='kr/kepconote/standalone/v100/MainActivity.smali'
OLD='Landroid/webkit/WebView;'
NEW='Lkr/kepconote/input/SpenWebView;'

def run(*args):subprocess.run([str(a) for a in args],check=True)
def tools_at(directory,download=False):
 directory=pathlib.Path(directory);directory.mkdir(parents=True,exist_ok=True)
 for entry in json.loads((ROOT/'native/toolchain-lock.json').read_text()):
  path=directory/entry['name']
  if not path.exists():
   if not download:raise RuntimeError('Missing pinned tool: '+str(path)+' (use --download-tools)')
   urllib.request.urlretrieve(entry['url'],path)
  if hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:raise RuntimeError('Tool digest mismatch: '+entry['name'])
 return directory

def build_dex(blob,output,tool_dir):
 tools=tools_at(tool_dir)
 with tempfile.TemporaryDirectory(prefix='kepco-native-') as tmp:
  tmp=pathlib.Path(tmp);source=tmp/'original.dex';source.write_bytes(blob)
  smali=tmp/'smali';cp=str(tools/'*')
  run('java','-cp',cp,'org.jf.baksmali.Main','d',source,'-o',smali)
  main=smali/MAIN;text=main.read_text()
  allocation='new-instance p1, '+OLD
  constructor='invoke-direct {p1, p0}, '+OLD+'-><init>(Landroid/content/Context;)V'
  if text.count(allocation)!=1 or text.count(constructor)!=1:raise RuntimeError('Unexpected native base; refusing heuristic patch')
  original={str(f.relative_to(smali)):f.read_text() for f in smali.rglob('*.smali')}
  patched=text.replace(allocation,allocation.replace(OLD,NEW)).replace(constructor,constructor.replace(OLD,NEW))
  main.write_text(patched)
  classes=tmp/'classes';classes.mkdir();dex=tmp/'helper-dex';dex.mkdir()
  sources=sorted((ROOT/'native/src').rglob('*.java'))
  webkit=tmp/'webkit.jar'
  with zipfile.ZipFile(tools/'webkit-1.13.0.aar') as aar:webkit.write_bytes(aar.read('classes.jar'))
  compile_classpath=':'.join(map(str,[tools/'android-4.1.1.4.jar',webkit,tools/'json-20080701.jar']))
  run('java','-jar',tools/'ecj-3.33.0.jar','-8','-classpath',compile_classpath,'-d',classes,*sources)
  run('java','-cp',tools/'r8.jar','com.android.tools.r8.D8','--min-api','23','--no-desugaring','--lib',tools/'android-4.1.1.4.jar','--classpath',webkit,'--classpath',tools/'json-20080701.jar','--output',dex,*sorted(classes.rglob('*.class')))
  helper=tmp/'helper';run('java','-cp',cp,'org.jf.baksmali.Main','d',dex/'classes.dex','-o',helper)
  for f in helper.rglob('*.smali'):
   dest=smali/f.relative_to(helper)
   if dest.exists():raise RuntimeError('Refusing replacement of existing class '+str(dest))
   dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,dest)
  run('java','-cp',cp,'org.jf.smali.Main','a',smali,'-o',output)
  verified=tmp/'verified';run('java','-cp',cp,'org.jf.baksmali.Main','d',output,'-o',verified)
  # Fail closed if any original class differs beyond the two planned references.
  changed=[]
  for rel,before in original.items():
   expected=patched if rel==MAIN else before
   after=(verified/rel).read_text()
   # smali omits trailing encoded static defaults; DEX default values are identical.
   normalize=lambda value:re.sub(r'(?m)^(\.field [^\n]+) = (?:0x0|false|null)$',r'\1',value)
   if normalize(after)!=normalize(expected):changed.append(rel)
  if changed:raise RuntimeError('Unexpected native disassembly changes: '+', '.join(changed[:12]))
  return {'original_class_count':len(original),'added_class_count':len(list(helper.rglob('*.smali'))),'input_dex_sha256':hashlib.sha256(blob).hexdigest(),'output_dex_sha256':hashlib.sha256(pathlib.Path(output).read_bytes()).hexdigest(),'original_classes_preserved_except_webview_constructor':True}

def patch(base,output,tool_dir):
 base=pathlib.Path(base);output=pathlib.Path(output)
 if base.resolve()==output.resolve():raise RuntimeError('Use separate output')
 with tempfile.TemporaryDirectory() as temp:
  dex=pathlib.Path(temp)/'classes.dex'
  with zipfile.ZipFile(base) as src:
   if [n for n in src.namelist() if n.startswith('classes') and n.endswith('.dex')]!=['classes.dex']:raise RuntimeError('Expected reviewed single DEX base')
   report=build_dex(src.read('classes.dex'),dex,tool_dir)
   with zipfile.ZipFile(output,'w') as dst:
    for info in src.infolist():
     if info.filename.startswith('META-INF/') and info.filename.upper().endswith(('.RSA','.DSA','.EC','.SF','.MF')):continue
     data=dex.read_bytes() if info.filename=='classes.dex' else src.read(info.filename)
     entry=copy.copy(info);entry.extra=b'';dst.writestr(entry,data)
  with zipfile.ZipFile(output) as check:assert check.testzip() is None
  output.with_suffix('.native-verification.json').write_text(json.dumps(report,indent=2)+'\n')
  return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('base');p.add_argument('output');p.add_argument('--tools',required=True);p.add_argument('--download-tools',action='store_true');a=p.parse_args()
 tools_at(a.tools,a.download_tools);print(json.dumps(patch(a.base,a.output,a.tools),indent=2))
