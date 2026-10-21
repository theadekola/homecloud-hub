const fail=(message,status)=>{throw Object.assign(Error(message),{status})};
export function changeAlertStatus(state,id,user,{resolve=false,now=()=>new Date().toISOString()}={}){
 const alert=state.alerts.find(a=>a.id===id);if(!alert)fail('Alert not found',404);
 if(alert.status==='resolved')return {status:alert.status};
 if(resolve){
  if(alert.status!=='acknowledged')fail('Acknowledge this alert before marking it resolved.',409);
  Object.assign(alert,{status:'resolved',resolvedAt:now(),resolvedBy:user.username||user.email||user.sub,resolution:'manual'});
 }else if(alert.status==='active')Object.assign(alert,{status:'acknowledged',acknowledgedBy:user.username||user.email||user.sub,acknowledgedAt:now()});
 return {status:alert.status,resolution:alert.resolution};
}
