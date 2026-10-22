"""Fixed, pairing-bound connection diagnostics and service starts over SSH."""
import ast,base64,hashlib,hmac,json,os,pathlib,re,subprocess,sys,time
ACTIONS=('connector-check','connector-start','docker-check','docker-start','monitoring-tools')

def execute(args,timeout=40,input=None):
    result=subprocess.run(args,capture_output=True,text=True,timeout=timeout,input=input)
    if result.returncode: raise RuntimeError('The service action failed. Check service installation, privileges and guest access, then recheck its status.')
    if len(result.stdout)>131072: raise RuntimeError('Diagnostic response exceeded the supported size')
    return result.stdout

def guest_run(target,script,run=execute):
    if target=='node': return run(['/bin/sh','-c',script])
    kind,vmid=target.split('/')
    if kind=='lxc': return run(['pct','exec',vmid,'--','/bin/sh','-c',script])
    result=json.loads(run(['qm','guest','exec',vmid,'--synchronous','1','--timeout','35','--pass-stdin','1','--','/bin/sh'],input=script))
    if not result.get('exited') or result.get('exitcode')!=0 or result.get('out-truncated'): raise RuntimeError('VM guest access failed. Check that the VM and QEMU Guest Agent are running and guest execution is permitted.')
    return result.get('out-data','')

def service_script(unit,start=False,docker=False):
    script='set -eu\n'
    if start:
        script+='test "$(systemctl show '+unit+' -p LoadState --value)" = loaded || exit 12\n'
        script+='if ! systemctl is-active --quiet '+unit+'; then timeout 30 systemctl start '+unit+'; fi\n'
        script+='systemctl is-active --quiet '+unit+' || exit 13\n'
    script+='systemctl show '+unit+' --property=LoadState,ActiveState,SubState,Result --no-pager\n'
    if docker:
        script+="printf '\\n__VERSION__\\n'\ndocker version --format '{{.Server.Version}}' 2>/dev/null || true\n"
        script+="printf '\\n__CONTAINERS__\\n'\nif docker ps -a --format '{{.State}}' 2>/dev/null; then printf '__CONTAINERS_OK__\\n'; fi\n"
        script+="printf '\\n__STATS__\\n'\ndocker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null | head -n 20 || true\n"
    return script

def service_reading(text):
    fields={}
    for line in text.splitlines():
        key,sep,value=line.partition('=')
        if sep and key in ('LoadState','ActiveState','SubState','Result') and re.fullmatch(r'[a-zA-Z0-9_.-]{1,80}',value): fields[key]=value
    if not fields.get('LoadState') or not fields.get('ActiveState'): raise RuntimeError('The host did not return a valid service status')
    return fields

def diagnose(payload,root=pathlib.Path('/'),run=execute):
    action=payload.get('action');target=payload.get('target')
    if action not in ACTIONS or not isinstance(target,str) or not re.fullmatch(r'node|(?:qemu|lxc)/[0-9]+',target): raise RuntimeError('Unsupported connection action or target')
    if (action.startswith('connector-') or action=='monitoring-tools') and target!='node': raise RuntimeError('Connector actions must target the paired host')
    if os.geteuid()!=0: raise RuntimeError('Root or sudo access is required')
    config=root/'etc/homecloud-node-agent.json'
    if config.is_symlink() or not config.is_file(): raise RuntimeError('Existing standard connector installation required')
    original=config.read_bytes();paired=json.loads(original)
    if paired.get('id')!=payload.get('id') or not hmac.compare_digest(hashlib.sha256(str(paired.get('token','')).encode()).hexdigest(),payload.get('tokenHash','')): raise RuntimeError('This SSH host is not the selected paired connector')
    if paired.get('kind','proxmox')=='docker' and target!='node': raise RuntimeError('Standalone connector cannot access Proxmox guests')
    starting=action.endswith('-start');docker=action.startswith('docker-');unit='docker.service' if docker else 'homecloud-node-agent.service'
    if config.read_bytes()!=original: raise RuntimeError('Pairing changed; no action was performed')
    if action=='monitoring-tools':
        run(['apt-get','update'],timeout=120)
        run(['apt-get','install','-y','smartmontools','nut-client','nftables'],timeout=180)
        packages=('smartmontools','nut-client','nftables')
        output=run(['dpkg-query','-W','-f=${Package} ${Status}\n',*packages],timeout=10)
        if not all(package+' install ok installed' in output.splitlines() for package in packages): raise RuntimeError('Monitoring package installation could not be verified. Check package-manager status before retrying.')
        return {'action':action,'target':'node','installed':True,'message':'Monitoring tools installed and package status verified. Measurements refresh within one minute. UPS readings require an existing local NUT server; no UPS shutdown policy was changed.'}
    output=guest_run(target,service_script(unit,starting,docker),run)
    parts=output.split('\n__VERSION__\n',1);service=service_reading(parts[0]);result={'action':action,'target':target,'service':service,'active':service['ActiveState']=='active'}
    if docker:
        sections=parts[1].split('\n__CONTAINERS__\n',1) if len(parts)>1 else []
        version=sections[0].strip() if sections else ''
        rest=sections[1].split('\n__STATS__\n',1) if len(sections)>1 else []
        states=[s for s in (rest[0].splitlines() if rest else []) if s in ('created','running','paused','restarting','removing','exited','dead')]
        result['docker']={'ready':bool(re.fullmatch(r'[0-9][A-Za-z0-9_.+-]{0,79}',version)),'version':version if re.fullmatch(r'[0-9][A-Za-z0-9_.+-]{0,79}',version) else None,'containers':{state:states.count(state) for state in sorted(set(states))},'total':len(states) if rest and '__CONTAINERS_OK__' in rest[0].splitlines() else None,'statistics':[line for line in (rest[1].splitlines() if len(rest)>1 else []) if re.fullmatch(r'[0-9.]+%\|[0-9. A-Za-z/]+',line)][:20]}
        if starting and not result['docker']['ready']: raise RuntimeError('Docker service is active but its Engine is not ready. Recheck Docker status before retrying.')
    else:
        agent=root/'usr/local/sbin/homecloud-node-agent.py'
        if agent.is_file() and not agent.is_symlink():
            source=agent.read_bytes()
            if len(source)<2000000:
                tree=ast.parse(source)
                result['version']=next((n.value.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='VERSION' for t in n.targets) and isinstance(n.value,ast.Constant) and isinstance(n.value.value,int)),None)
        # Return bounded, redacted service logs only. Never return pairing configuration.
        try:
            raw=run(['journalctl','-u',unit,'-n','20','--no-pager','-o','json'],timeout=10)
            lines=[]
            for line in raw.splitlines()[-20:]:
                entry=json.loads(line);message=str(entry.get('MESSAGE',''))
                for secret in (paired.get('token'),paired.get('url')):
                    if secret: message=message.replace(str(secret),'[redacted]')
                message=re.sub(r'(?i)((?:password|token|secret|authorization|api[ _-]?key)\s*[:=]\s*)[^\r\n]+',r'\1[redacted]',message)
                message=re.sub(r'(?i)(bearer\s+)[^\s,;]+',r'\1[redacted]',message)
                message=re.sub(r'https?://\S+','[endpoint]',message)
                lines.append({'time':str(entry.get('__REALTIME_TIMESTAMP',''))[:20],'message':message[:300]})
            result['logs']=lines
        except Exception: result['logsUnavailable']=True
    if starting and not result['active']: raise RuntimeError('Service start was not verified. Recheck the service status.')
    result['message']=('Docker service is active and Engine verified.' if docker else 'Connector service active state verified.') if starting else ('Docker diagnostics completed.' if docker else 'Connector diagnostics completed.')
    return result

if __name__=='__main__':
    try: print(json.dumps(diagnose(json.loads(base64.b64decode(sys.argv[1],validate=True)))))
    except Exception as error:
        print(json.dumps({'error':str(error) if isinstance(error,RuntimeError) else 'Connection action failed. Check host access, service installation and the selected target.'}));sys.exit(1)
