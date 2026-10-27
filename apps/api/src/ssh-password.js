// Password-only PAM login uses the same credentials as SSH password auth.
// Never send the password in response to an OTP, token or recovery challenge.
export function passwordAuthentication(client,password){
 client.on('keyboard-interactive',(_name,_instructions,_language,prompts,finish)=>{
  const passwordOnly=prompts.length===1&&prompts[0].echo===false&&/^\s*(?:[\w.@-]+(?:'s)?\s+)?password\s*:\s*$/i.test(prompts[0].prompt||'');
  finish(passwordOnly?[password]:prompts.map(()=>''));
 });
 return {password,tryKeyboard:true};
}
