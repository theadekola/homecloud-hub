import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function fixture({docker=true,consent='INSTALL',existing=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docker-installer-')),bin=path.join(dir,'bin'),log=path.join(dir,'calls');fs.mkdirSync(bin);
 const realPython=spawnSync('which',['python3'],{encoding:'utf8'}).stdout.trim();
 const command=(name,body)=>{const file=path.join(bin,name);fs.writeFileSync(file,'#!/bin/bash\nset -eu\n'+body,{mode:0o755});};
 command('curl',`if [[ "$*" == *--unix-socket* ]]; then printf '{"ServerVersion":"fixture"}'; else cp "$FIXTURE/agent.py" "\${@: -1}"; fi`);
 command('python3',`if [[ "$1" == -c ]]; then exec '${realPython}' "$@"; fi\nprintf '%s\\n' "$*" >> "$FIXTURE/calls"\nread -r code\n[[ "$code" == fixture-secret ]]`);
 command('systemctl','printf "systemctl %s\\n" "$*" >> "$FIXTURE/calls"\nif [[ "$*" == "enable --now docker" ]]; then touch "$FIXTURE/docker.sock"; fi');
 command('apt-get','printf "apt-get %s\\n" "$*" >> "$FIXTURE/calls"');
 if(docker)fs.writeFileSync(path.join(dir,'docker.sock'),'');if(existing)fs.writeFileSync(path.join(dir,'config.json'),'existing');fs.writeFileSync(path.join(dir,'agent.py'),'# fixture');
 let script=fs.readFileSync(new URL('../src/agent-assets/install-docker-agent.sh',import.meta.url),'utf8');
 // Redirect every installation target and socket check to fixtures. No system paths are written.
 script=script.replace('if command -v dockerd >/dev/null || command -v podman >/dev/null; then','if false; then').replace('[[ $EUID == 0 ]]','[[ 0 == 0 ]]').replaceAll('/etc/homecloud-node-agent.json',dir+'/config.json').replaceAll('/usr/local/sbin/homecloud-node-agent.py',dir+'/installed.py').replaceAll('/etc/systemd/system/homecloud-node-agent.service',dir+'/service').replaceAll('test -S /var/run/docker.sock','test -f "'+dir+'/docker.sock"');
 const file=path.join(dir,'install.sh');fs.writeFileSync(file,script);const result=spawnSync('bash',[file],{input:`https://homecloud.test\n${docker?'':consent+'\n'}fixture-secret\n`,encoding:'utf8',env:{...process.env,PATH:bin+':/usr/bin:/bin',FIXTURE:dir}});
 const calls=fs.existsSync(log)?fs.readFileSync(log,'utf8'):'';fs.rmSync(dir,{recursive:true,force:true});return {...result,calls};
}
test('Standalone installer verifies existing Docker, pairs via stdin and opens no TCP listener',()=>{
 const result=fixture();assert.equal(result.status,0,result.stderr);assert.ok(result.calls.includes('--pair-stdin --kind docker'));assert.ok(!result.calls.includes('fixture-secret'));assert.ok(!result.calls.includes('apt-get'));assert.ok(result.calls.includes('enable --now homecloud-node-agent'));assert.ok(result.stdout.includes('No Docker TCP port was opened'));
});
test('Missing Docker needs explicit installation consent',()=>{
 const cancelled=fixture({docker:false,consent:'NO'});assert.equal(cancelled.status,1);assert.equal(cancelled.calls,'');
 const installed=fixture({docker:false});assert.equal(installed.status,0,installed.stderr);assert.ok(installed.calls.includes('apt-get install -y docker.io'));assert.ok(!installed.calls.includes('upgrade'));assert.ok(!installed.calls.includes('qemu-guest-agent'));
});
test('Installer refuses to overwrite an existing connector',()=>{const result=fixture({existing:true});assert.equal(result.status,1);assert.equal(result.calls,'');assert.ok(result.stdout.includes('already configured'));});
