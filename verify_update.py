#!/usr/bin/env python3
"""Verify the patch and run the actual browser-independent regression tests."""
import argparse,hashlib,json,pathlib,shutil,subprocess,tempfile,zipfile

ROOT=pathlib.Path(__file__).resolve().parent
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('base_apk',type=pathlib.Path)
    args=parser.parse_args()
    meta=json.loads((ROOT/'validation.json').read_text())
    assert hashlib.sha256(args.base_apk.read_bytes()).hexdigest()==meta['base_sha256']
    with tempfile.TemporaryDirectory(prefix='kepco-verify-') as folder:
        root=pathlib.Path(folder);web=root/'work/www';web.mkdir(parents=True)
        with zipfile.ZipFile(args.base_apk) as archive:
            for info in archive.infolist():
                if info.is_dir() or not info.filename.startswith('assets/www/'):continue
                relative=pathlib.PurePosixPath(info.filename.removeprefix('assets/www/'))
                assert not relative.is_absolute() and '..' not in relative.parts
                target=web/relative;target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(archive.read(info))
        shutil.copytree(ROOT/'update-source',web,dirs_exist_ok=True)
        for name,digest in meta['unchanged_calendar_diary'].items():
            assert hashlib.sha256((web/name).read_bytes()).hexdigest()==digest,name
        for item in meta['changes']:
            path=web/item['path'].removeprefix('assets/www/')
            assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256'],item['path']
        for path in (web/'src').glob('*.js'):
            subprocess.run(['node','--check',str(path)],check=True)
        shutil.copytree(ROOT/'tests/upstream',web/'tests')
        (root/'tests').mkdir()
        for path in (ROOT/'tests').glob('*.mjs'):shutil.copyfile(path,root/'tests'/path.name)
        subprocess.run(['node','--test',*map(str,sorted((root/'tests').glob('*.mjs')))],cwd=root,check=True)
        subprocess.run(['node','--test',*map(str,sorted((web/'tests').glob('*.mjs')))],cwd=web,check=True)
    print('Patch integrity and code regressions passed. Physical Android validation remains pending.')
if __name__=='__main__':main()
