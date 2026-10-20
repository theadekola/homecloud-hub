"""Fixed SSH maintenance operation. Never changes pairing or Docker/guest services."""
import zlib,ast,base64,fcntl,hashlib,hmac,json,os,pathlib,shutil,subprocess,sys,tempfile,time

def update(payload,root=pathlib.Path('/'),run=subprocess.run):
    if os.geteuid()!=0: raise RuntimeError('Root or sudo access is required')
    config=root/'etc/homecloud-node-agent.json'
    agent=root/'usr/local/sbin/homecloud-node-agent.py'
    if config.is_symlink() or agent.is_symlink() or not config.is_file() or not agent.is_file(): raise RuntimeError('Existing standard connector installation required')
    original=config.read_bytes(); paired=json.loads(original)
    if paired.get('id')!=payload['id'] or not hmac.compare_digest(hashlib.sha256(str(paired.get('token','')).encode()).hexdigest(),payload['tokenHash']): raise RuntimeError('This SSH host is not the selected paired connector')
    installed=ast.parse(agent.read_bytes())
    versions=[n.value.value for n in installed.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='VERSION' for t in n.targets) and isinstance(n.value,ast.Constant) and isinstance(n.value.value,int)]
    if versions and max(versions)>payload['version']: raise RuntimeError('Update i-Clusters before updating this newer connector')
    source=base64.b64decode(payload['source'],validate=True)
    if hashlib.sha256(source).hexdigest()!=payload['revision']: raise RuntimeError('Connector checksum mismatch')
    tree=ast.parse(source);compile(tree,str(agent),'exec')
    if not any(isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='VERSION' for t in n.targets) and isinstance(n.value,ast.Constant) and n.value.value==payload['version'] for n in tree.body): raise RuntimeError('Connector version mismatch')
    lock_path=root/'run/homecloud-connector-update.lock'
    with open(lock_path,'a') as lock:
        os.chmod(lock_path,0o600)
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if config.read_bytes()!=original: raise RuntimeError('Pairing changed during verification; no update performed')
        backups=root/'var/backups';backups.mkdir(exist_ok=True)
        backup=pathlib.Path(tempfile.mkdtemp(prefix='homecloud-connector-',dir=backups));os.chmod(backup,0o700)
        shutil.copy2(config,backup/'config.json');os.chmod(backup/'config.json',0o600)
        shutil.copy2(agent,backup/'agent.py');os.chmod(backup/'agent.py',0o600)
        fd,next_path=tempfile.mkstemp(prefix='.homecloud-connector-',dir=agent.parent)
        try:
            with os.fdopen(fd,'wb') as target: target.write(source);target.flush();os.fsync(target.fileno())
            os.chmod(next_path,0o600)
            os.replace(next_path,agent)
            result=run(['systemctl','restart','homecloud-node-agent.service'],capture_output=True,timeout=30)
            if result.returncode: raise RuntimeError('Connector restart failed')
            for _ in range(3):
                time.sleep(1)
                if run(['systemctl','is-active','--quiet','homecloud-node-agent.service'],capture_output=True,timeout=10).returncode: raise RuntimeError('Connector did not remain active')
            if config.read_bytes()!=original: raise RuntimeError('Pairing configuration changed unexpectedly')
        except Exception:
            shutil.copy2(backup/'agent.py',agent)
            run(['systemctl','restart','homecloud-node-agent.service'],capture_output=True,timeout=30)
            raise RuntimeError('Update failed; previous connector script restored. Inspect its service on this host.') from None
        finally:
            if os.path.exists(next_path):os.unlink(next_path)
    return {'installed':True,'revision':payload['revision'],'backup':str(backup.relative_to(root))}

if __name__=='__main__':
    try: print(json.dumps(update(json.loads(zlib.decompress(base64.b64decode(sys.argv[1],validate=True))))))
    except Exception as error:
        # Fixed messages only; never print config, tokens, command output or supplied credentials.
        print(json.dumps({'error':str(error) if isinstance(error,RuntimeError) else 'Connector maintenance failed; check host access and installation.'}));sys.exit(1)
