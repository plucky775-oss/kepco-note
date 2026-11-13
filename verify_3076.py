#!/usr/bin/env python3
"""Verify final APK assets, imports and regressions without claiming device QA."""
import argparse,pathlib,zipfile,shutil,tempfile,re,subprocess
ROOT=pathlib.Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('apk',type=pathlib.Path);a=p.parse_args()
with tempfile.TemporaryDirectory(prefix='kepco3076-check-') as folder:
 root=pathlib.Path(folder);web=root/'work/www';web.mkdir(parents=True)
 with zipfile.ZipFile(a.apk) as z:
  assert z.testzip() is None
  for info in z.infolist():
   if info.is_dir() or not info.filename.startswith('assets/www/'):continue
   rel=pathlib.PurePosixPath(info.filename.removeprefix('assets/www/'));assert '..' not in rel.parts and not rel.is_absolute()
   dst=web/rel;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(z.read(info))
 count=0
 for f in web.rglob('*.js'):
  if 'vendor' not in f.relative_to(web).parts:
   subprocess.run(['node','--check',str(f)],check=True);count+=1
  for ref in re.findall(r'''(?:from\s*|import\s*)['"](\.[^'"]+)['"]''',f.read_text()):assert (f.parent/ref).is_file(),(str(f),ref)
 shutil.copytree(ROOT/'native',root/'native');shutil.copytree(ROOT/'tests',root/'tests');shutil.copytree(ROOT/'tests/upstream',web/'tests');(root/'update-source').symlink_to(web,target_is_directory=True)
 subprocess.run(['node','--test',*map(str,sorted((root/'tests').glob('*.mjs'))),*map(str,sorted((root/'tests/video').glob('*.mjs')))],cwd=root,check=True)
 subprocess.run(['node','--test',*map(str,sorted((web/'tests').glob('*.mjs')))],cwd=web,check=True)
 print('JavaScript syntax and import checks:',count)
 print('Native host and device tests are separate; this does not validate Galaxy hardware.')
