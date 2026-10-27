import fs from 'node:fs';
// Scope certificate policy to TrueNAS; never change global Node TLS behavior.
export function truenasTls(env){
 const verify=env.TRUENAS_VERIFY_TLS==='true'||env.TRUENAS_VERIFY_TLS!=='false'&&!!(env.TRUENAS_CA_PEM||env.TRUENAS_TLS_CA);
 return {rejectUnauthorized:verify,...(verify?{ca:env.TRUENAS_CA_PEM||(env.TRUENAS_TLS_CA?fs.readFileSync(env.TRUENAS_TLS_CA):undefined)}:{})};
}
