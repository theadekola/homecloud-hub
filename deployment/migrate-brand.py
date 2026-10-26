#!/usr/bin/env python3
"""Preserve an existing deployment's resource identity while adopting i-Clusters."""
import importlib.util,os,subprocess
from pathlib import Path

def migrate(project,legacy=None):
    env=project/'.env'
    if not env.is_file():return False
    original=env.read_text();lines=original.splitlines()
    values=dict(line.split('=',1) for line in lines if '=' in line and not line.lstrip().startswith('#'))
    if legacy is None:
        legacy=project.resolve()==Path('/opt/homecloud-hub') or values.get('POSTGRES_DB')=='homecloud'
        if not legacy and (project/'runtime').is_dir():
            try:legacy=subprocess.run(['docker','volume','inspect','homecloud-hub_postgres_data'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10).returncode==0
            except (OSError,subprocess.TimeoutExpired):pass
    additions={}
    if legacy and 'COMPOSE_PROJECT_NAME' not in values:additions['COMPOSE_PROJECT_NAME']='homecloud-hub'
    for key,value in values.items():
        if key.startswith('HOMECLOUD_') and key.replace('HOMECLOUD_','ICLUSTERS_',1) not in values:additions[key.replace('HOMECLOUD_','ICLUSTERS_',1)]=value
    # Database names/passwords and all cryptographic secrets remain unchanged.
    lines=[line.replace('/run/homecloud/','/run/iclusters/') for line in lines if not line.startswith('HOMECLOUD_')]
    lines.extend(key+'='+value for key,value in additions.items())
    updated='\n'.join(lines)+'\n'
    if original==updated:return False
    backup=project/'.env.before-iclusters'
    if not backup.exists():backup.write_text(original);backup.chmod(0o600)
    temporary=project/'.env.brand-tmp';temporary.write_text(updated);temporary.chmod(0o600);temporary.replace(env)
    return True

if __name__=='__main__':migrate(Path.cwd())
