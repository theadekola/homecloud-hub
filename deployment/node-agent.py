#!/usr/bin/env python3
"""Read-only inventory collector. Does not receive commands from the hub."""
import json, os, socket, subprocess, time, urllib.request
from pathlib import Path

def collect(run=None):
    errors=[]
    def command(args):
        try:
            if run: return run(args)
            return subprocess.check_output(args, text=True, timeout=20, stderr=subprocess.DEVNULL)
        except (OSError, subprocess.SubprocessError) as error:
            errors.append(args[0]+': '+type(error).__name__)
            return ''
    services=[]
    for line in command(['systemctl','list-units','--type=service','--all','--no-legend','--plain','--no-pager']).splitlines():
        parts=line.split()
        if len(parts)>=4: services.append({'name':parts[0],'status':parts[3] if parts[2]=='active' else parts[2]})
    packages=[]
    for line in command(['dpkg-query','-W','-f=${binary:Package}\t${Version}\t${db:Status-Status}\n']).splitlines():
        parts=line.split('\t')
        if len(parts)==3 and parts[2]=='installed': packages.append({'name':parts[0],'version':parts[1],'status':'installed'})
    containers=[]
    if Path('/var/run/docker.sock').exists() or run:
        for line in command(['docker','ps','-a','--no-trunc','--format','{{json .}}']).splitlines():
            try:
                row=json.loads(line)
                containers.append({'id':row['ID'],'name':row['Names'],'image':row['Image'],'status':row['State']})
            except (ValueError,KeyError): errors.append('Invalid Docker inventory row')
    machine=Path('/etc/machine-id').read_text().strip()
    os_name=next((line.split('=',1)[1].strip('"') for line in Path('/etc/os-release').read_text().splitlines() if line.startswith('PRETTY_NAME=')),'Linux')
    return {'id':machine,'hostname':socket.gethostname(),'os':os_name,'services':services[:1000],'packages':packages[:6000],'containers':containers[:1000],'errors':errors}

if __name__=='__main__':
    config=json.loads(Path('/etc/homecloud-agent.json').read_text())
    while True:
        try:
            req=urllib.request.Request(config['hub'].rstrip('/')+'/api/discovery/report',data=json.dumps(collect()).encode(),headers={'Authorization':'Bearer '+config['key'],'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(req,timeout=30) as response: response.read()
            print('Inventory reported.',flush=True)
        except Exception as error: print('Discovery report failed: '+type(error).__name__,flush=True)
        time.sleep(30)
