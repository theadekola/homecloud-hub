import importlib.util
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('agent',Path(__file__).with_name('node-agent.py'))
agent=importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)
def run(args):
    return {'systemctl':'nginx.service loaded active running nginx\nbackup.service loaded inactive dead backup\n','dpkg-query':'nginx\t1.24\tinstalled\nold\t1\tconfig-files\n','docker':'{"ID":"abc","Names":"actual-app","Image":"nextcloud:apache","State":"running"}\n'}[args[0]]
with patch.object(Path,'read_text',return_value='fixture-machine-id'), patch.object(Path,'exists',return_value=True):
    report=agent.collect(run)
assert report['services'][0]['name']=='nginx.service'
assert report['services'][1]['status']=='inactive'
assert report['packages']==[{'name':'nginx','version':'1.24','status':'installed'}]
assert report['containers'][0]['image']=='nextcloud:apache'
assert report['errors']==[]
print('Actual service, package and Docker inventory parsing passed.')
