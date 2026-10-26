// Move historical browser state once; never replace a newer setting.
export function migrateBrandStorage(stores:Storage[]){
 for(const storage of stores){
  for(const key of Object.keys(storage))if(key.startsWith('homecloud')){
   const next=key.replace(/^homecloud/,'iclusters');
   try{if(storage.getItem(next)===null){const value=storage.getItem(key);if(value!==null)storage.setItem(next,value)}storage.removeItem(key)}catch{/* Leave the old value intact if storage is unavailable. */}
  }
 }
}
try{migrateBrandStorage([localStorage,sessionStorage])}catch{/* A blocked storage area must not prevent loading. */}
