// Checks reviewed evidence records; never executes provider operations or certifies evidence.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export const requiredChecks=['identity','access','providers','backups','guestRestore','controllerRecovery','interruptedUpdates','softwareRollback','notifications','devices','load','security','operations'];
export function evaluateAcceptance(record,{now=Date.now()}={}){
 const issues=[];
 if(record?.schema!==1)issues.push('Unsupported evidence schema.');
 if(!['dedicated-controller-pilot','dedicated-controller-production'].includes(record?.scope))issues.push('Only dedicated-controller deployments are supported.');
 if(typeof record?.revision!=='string'||!/^[a-f0-9]{40}$/.test(record.revision))issues.push('Record the exact deployed Git revision.');
 for(const key of ['installation','version','reviewer'])if(typeof record?.[key]!=='string'||!record[key].trim())issues.push(`Missing ${key}.`);
 if(record?.approved!==true)issues.push('Reviewer approval is missing.');
 const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now;
 if(!validDate(record?.reviewedAt))issues.push('Review date is missing, invalid or in the future.');
 for(const key of requiredChecks){const check=record?.checks?.[key];if(check?.status!=='passed')issues.push(`${key}: not passed.`);if(typeof check?.reviewer!=='string'||!check.reviewer.trim())issues.push(`${key}: missing reviewer.`);if(!validDate(check?.testedAt)||Date.parse(check.testedAt)>Date.parse(record?.reviewedAt))issues.push(`${key}: missing or invalid test date, or test postdates review.`);if(check?.revision!==record?.revision)issues.push(`${key}: evidence does not match the deployed revision.`);if(!Array.isArray(check?.evidence)||!check.evidence.length||check.evidence.some(v=>typeof v!=='string'||!v.trim()))issues.push(`${key}: missing evidence references.`);}
 const targets=record?.operations;
 for(const key of ['supportContact','securityContact','maintenanceWindow','backupRetention','keyCustodian'])if(typeof targets?.[key]!=='string'||!targets[key].trim())issues.push(`operations: missing ${key}.`);
 for(const key of ['rpoMinutes','rtoMinutes'])if(!Number.isFinite(targets?.[key])||targets[key]<=0)issues.push(`operations: ${key} must be agreed and positive.`);
 if(!Array.isArray(record?.providerVersions)||!record.providerVersions.length||record.providerVersions.some(p=>!p?.provider||!p?.version))issues.push('Exact in-scope provider versions are required.');
 if(!Number.isInteger(record?.capacity?.hosts)||record.capacity.hosts<1||!Number.isInteger(record?.capacity?.concurrentUsers)||record.capacity.concurrentUsers<1)issues.push('Measured host and concurrent-user scope is required.');
 return {schema:1,ready:issues.length===0,scope:record?.scope||null,revision:record?.revision||null,issues,boundary:'Validates completeness of a human-reviewed record; does not verify evidence authenticity, security or recoverability.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{if(process.argv.length!==3)throw Error('Usage: node deployment/acceptance-gate.mjs PRIVATE-ACCEPTANCE.json');const file=process.argv[2];if(fs.statSync(file).size>1048576)throw Error('Acceptance record exceeds 1 MiB.');const result=evaluateAcceptance(JSON.parse(fs.readFileSync(file,'utf8')));console.log(JSON.stringify(result,null,2));process.exitCode=result.ready?0:1}catch{console.error('Acceptance check failed. Supply a valid private JSON evidence record (maximum 1 MiB).');process.exitCode=1}}
