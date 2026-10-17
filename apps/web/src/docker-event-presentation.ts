/** Interpret reported Docker events without treating command text as an execution result. */
export function describeDockerEvent(event:any){
 const raw=String(event.Action||event.status||''), attributes=event.Actor?.Attributes||{};
 const object=String(attributes.name||event.Actor?.ID||event.id||'the reported object');
 const action=raw.startsWith('exec_create:')?'exec_create':raw.startsWith('exec_start:')?'exec_start':raw;
 const command=action.startsWith('exec_')&&raw.includes(':')?raw.slice(raw.indexOf(':')+1).trim():null;
 const exit=attributes.exitCode, hasExit=exit!==undefined&&exit!==null&&String(exit)!=='';
 const outcomes:Record<string,[string,string]>={
  exec_create:['Command prepared',`Docker prepared a command to run inside ${object}.`],
  exec_start:['Command started',`Docker started a command inside ${object}.`],
  exec_die:['Command finished',`A command inside ${object} finished. This event refers to the command, not the container stopping.`],
  create:['Container created',`Docker created ${object}. Creation alone does not confirm that it is running.`],
  start:['Container started',`Docker reported that ${object} started.`],
  stop:['Container stopped',`Docker reported that ${object} stopped.`],
  die:['Container exited',`The main process in ${object} exited.`],
  restart:['Container restarted',`Docker reported a restart of ${object}.`],
  destroy:['Object removed',`Docker removed ${object}.`],
  oom:['Memory limit reached',`Docker reported an out-of-memory event for ${object}. Inspect its memory limits and application logs.`],
  'health_status: healthy':['Health check passed',`Docker reported a healthy status for ${object}.`],
  'health_status: unhealthy':['Health check failed',`Docker reported an unhealthy status for ${object}. Inspect its health check output and application logs.`],
 };
 const known=event.Type==='container'?outcomes[action]:undefined;
 const [title,description]=known||[action||'Event reported',`Docker reported ${action||'an event'} for ${object} (source: ${event.Type||'not reported'}).`];
 let outcome='This records a past event. It does not confirm the current state; check the resource page for its latest status.';
 if(action==='exec_create'||action==='exec_start')outcome='No command result is reported by this event. Text such as “exit 1” inside the command does not mean it failed.';
 if(action==='exec_die'||action==='die')outcome=hasExit?(String(exit)==='0'?'Reported exit code: 0 (successful exit).':`Reported exit code: ${exit} (non-zero exit). Inspect the application logs for the cause.`):'No exit code was reported, so success or failure cannot be determined from this event.';
 return {title,description,outcome,command};
}
