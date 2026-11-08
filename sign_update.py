#!/usr/bin/env python3
"""Sign only with the original key; never emit an incompatible replacement APK."""
import argparse,json,pathlib,re,shutil,subprocess,tempfile

ROOT=pathlib.Path(__file__).resolve().parent
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--keystore',required=True,type=pathlib.Path)
    parser.add_argument('--alias',required=True)
    parser.add_argument('--apksigner',default='apksigner')
    parser.add_argument('--zipalign',default='zipalign')
    args=parser.parse_args()
    if not args.keystore.is_file():parser.error('The existing original keystore is required.')
    apk=ROOT/'KEPCO-note-107-UNSIGNED.apk'
    output=ROOT/'KEPCO-note-107.apk'
    if output.exists():parser.error('Output already exists; move it before signing again.')
    if not apk.exists():parser.error('Run build_update.py first.')
    meta=json.loads((ROOT/'validation.json').read_text())
    with tempfile.TemporaryDirectory(prefix='kepco-sign-') as folder:
        aligned=pathlib.Path(folder)/'aligned.apk';signed=pathlib.Path(folder)/'signed.apk'
        subprocess.run([args.zipalign,'-P','16','-f','4',str(apk),str(aligned)],check=True)
        # apksigner prompts locally; passwords are never written to a file or log here.
        subprocess.run([args.apksigner,'sign','--ks',str(args.keystore.resolve()),'--ks-key-alias',args.alias,'--out',str(signed),str(aligned)],check=True)
        result=subprocess.run([args.apksigner,'verify','--verbose','--print-certs',str(signed)],check=True,capture_output=True,text=True)
        fingerprints=re.findall(r'Signer #\d+ certificate SHA-256 digest:\s*([0-9a-fA-F:]+)',result.stdout)
        fingerprints=[x.replace(':','').lower() for x in fingerprints]
        if fingerprints!=[meta['signer_sha256_required']]:
            raise SystemExit('Signature differs from the original APK. No installable output was created. Use the original keystore.')
        subprocess.run([args.zipalign,'-c','-P','16','4',str(signed)],check=True)
        shutil.copyfile(signed,output)
    print('Original certificate verified:',output)
if __name__=='__main__':main()
