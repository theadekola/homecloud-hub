// A manual test is temporary evidence, never a permanent override of monitoring.
export function connectionTestState(row:any,test:any,now=Date.now()){
 if(!test)return row;
 const tested=Date.parse(test.checkedAt),observed=Date.parse(row.checkedAt);
 if(!Number.isFinite(tested)||tested>now+60000||now-tested>180000||Number.isFinite(observed)&&observed>=tested)return row;
 return {...row,...test};
}
