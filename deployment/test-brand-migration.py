import importlib.util,tempfile,unittest,subprocess,os,shutil
from pathlib import Path
spec=importlib.util.spec_from_file_location('brand',Path(__file__).with_name('migrate-brand.py'));brand=importlib.util.module_from_spec(spec);spec.loader.exec_module(brand)
class Migration(unittest.TestCase):
 def test_existing_resources_and_secrets_are_preserved(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);env=root/'.env';old='POSTGRES_DB=homecloud\nPOSTGRES_USER=homecloud\nJWT_SECRET=keep-this\nHOMECLOUD_BUILD_NUMBER=42\nDOCKER_TLS_CA=/run/homecloud/ca/root.pem\n';env.write_text(old)
   self.assertTrue(brand.migrate(root,legacy=True));value=env.read_text();self.assertIn('COMPOSE_PROJECT_NAME=homecloud-hub',value);self.assertIn('ICLUSTERS_BUILD_NUMBER=42',value);self.assertIn('POSTGRES_DB=homecloud',value);self.assertIn('JWT_SECRET=keep-this',value);self.assertIn('/run/iclusters/ca/',value);self.assertEqual((root/'.env.before-iclusters').read_text(),old);self.assertEqual(env.stat().st_mode&0o777,0o600);self.assertFalse(brand.migrate(root,legacy=True))
 def test_new_install_and_custom_compose_identity_are_unchanged(self):
  for extra in ['', 'COMPOSE_PROJECT_NAME=custom\n']:
   with tempfile.TemporaryDirectory() as directory:
    root=Path(directory);env=root/'.env';value='POSTGRES_DB=iclusters\n'+extra;env.write_text(value);self.assertFalse(brand.migrate(root,legacy=False));self.assertEqual(env.read_text(),value)
 def test_standard_installation_finishes_under_new_names_with_data_and_aliases_preserved(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);old=root/'opt/homecloud-hub';new=root/'opt/i-clusters';old.mkdir(parents=True)
   (old/'deployment').mkdir();(old/'runtime').mkdir();(old/'runtime/state').write_text('preserved')
   for name in ['iclusters','i-clusters.service']:shutil.copy2(Path(__file__).with_name(name),old/'deployment'/name)
   for part in ['usr/local/bin','etc/systemd/system','var/lib/homecloud-updater','bin']:(root/part).mkdir(parents=True)
   (root/'usr/local/bin/homecloud').write_text('old');(root/'var/lib/homecloud-updater/update-status.json').write_text('status')
   for name,body in [('systemctl','printf "%s\\n" "$*" >> "$COMMANDS"'),('git','if [[ "$*" == "remote get-url origin" ]]; then echo https://github.com/theadekola/homecloud-hub.git; else printf "%s\\n" "$*" >> "$COMMANDS"; fi')]:
    executable=root/'bin'/name;executable.write_text('#!/bin/bash\n'+body+'\n');executable.chmod(0o755)
   script=Path(__file__).with_name('finish-brand-migration.sh').read_text()
   for prefix in ['/opt/','/usr/local/','/etc/systemd/','/var/lib/']:script=script.replace(prefix,str(root)+prefix)
   file=root/'finish.sh';file.write_text(script);environment={**os.environ,'PATH':str(root/'bin')+':'+os.environ['PATH'],'COMMANDS':str(root/'commands')}
   result=subprocess.run(['bash',str(file)],cwd=old,env=environment,capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stderr);self.assertTrue(old.is_symlink());self.assertEqual((new/'runtime/state').read_text(),'preserved');self.assertEqual((root/'usr/local/bin/homecloud').resolve(),root/'usr/local/bin/iclusters');self.assertEqual((root/'var/lib/iclusters-updater/update-status.json').read_text(),'status');self.assertIn('disable --now homecloud-updater.timer homecloud-updater.path',(root/'commands').read_text());self.assertIn('remote set-url origin https://github.com/theadekola/i-clusters.git',(root/'commands').read_text())
   self.assertEqual(subprocess.run(['bash',str(file)],cwd=new,env=environment,capture_output=True).returncode,0)
if __name__=='__main__':unittest.main()
