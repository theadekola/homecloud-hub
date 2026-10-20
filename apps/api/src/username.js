const fail=message=>{throw Object.assign(Error(message),{status:400})};
export function accountIdentity(input={}){
 const email=typeof input.email==='string'?input.email.trim().toLowerCase()||null:null;
 if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))fail('Enter a valid email address.');
 // Older clients may still create accounts using email; their local part becomes
 // the initial username. The unique database index rejects collisions.
 const username=typeof input.username==='string'?input.username.trim().toLowerCase():email?.split('@')[0];
 if(!username||!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username))fail('Username must be 3–64 characters: letters, numbers, dots, underscores or hyphens, starting with a letter or number.');
 return {username,email};
}
