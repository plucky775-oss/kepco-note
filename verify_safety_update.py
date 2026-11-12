#!/usr/bin/env python3
"""Verify the 207.5 source overlay against the exact signed 207.4 base."""
import argparse, hashlib, json, pathlib, re, shutil, subprocess, tempfile, zipfile
from build_safety_update import build
ROOT=pathlib.Path(__file__).resolve().parent

def main():
 p=argparse.ArgumentParser();p.add_argument('base_apk',type=pathlib.Path);args=p.parse_args()
 with tempfile.TemporaryDirectory(prefix='kepco-safety-verify-') as directory:
  root=pathlib.Path(directory);apk=root/'207.5-UNSIGNED.apk';build(args.base_apk,apk)
  web=root/'work/www';web.mkdir(parents=True)
  with zipfile.ZipFile(apk) as source:
   for info in source.infolist():
    if info.is_dir() or not info.filename.startswith('assets/www/'):continue
    name=pathlib.PurePosixPath(info.filename.removeprefix('assets/www/'))
    if name.is_absolute() or '..' in name.parts:raise ValueError('Unsafe APK asset path')
    target=web/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read(info))
  checked=0
  for path in web.rglob('*.js'):
   if 'vendor' not in path.relative_to(web).parts:
    subprocess.run(['node','--check',str(path)],check=True);checked+=1
   for ref in re.findall(r'''(?:from\s*|import\s*)['"](\.[^'"]+)['"]''',path.read_text()):
    if not (path.parent/ref).is_file():raise ValueError('Unresolved import: '+str(path)+' '+ref)
  shutil.copytree(ROOT/'tests',root/'tests');shutil.copytree(ROOT/'tests/upstream',web/'tests')
  # Video tests import update-source; use the actual repacked assets, not stubs.
  (root/'update-source').symlink_to(web,target_is_directory=True)
  subprocess.run(['node','--test',*map(str,sorted((root/'tests').glob('*.mjs'))),*map(str,sorted((root/'tests/video').glob('*.mjs')))],cwd=root,check=True)
  subprocess.run(['node','--test',*map(str,sorted((web/'tests').glob('*.mjs')))],cwd=web,check=True)
  print(f'Passed: {checked} JavaScript syntax checks, static imports, APK integrity and all regression tests.')
  print('No signing, installation, physical Android playback or encoder verification performed.')
if __name__=='__main__':main()
