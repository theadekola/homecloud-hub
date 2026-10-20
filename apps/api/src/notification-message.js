const limit=(value,size)=>String(value??'').slice(0,size);
export function notificationMessage(alert={},event='active'){
 const recovered=event==='resolved',severity=['critical','warning','info'].includes(alert.severity)?alert.severity:'unknown',date=alert.occurredAt||(recovered?alert.resolvedAt:alert.triggered),time=Number.isFinite(Date.parse(date))?new Date(date).toISOString():null;
 const connection=recovered&&typeof alert.key==='string'&&alert.key.startsWith('connection:');
 return {title:limit(`${connection?'Connection restored':recovered?'Resolved':event==='test'?'Test notification':severity.toUpperCase()}: ${connection?alert.source||'i-Clusters connection':alert.title||'i-Clusters alert'}`,250),source:limit(alert.source||'i-Clusters',500),details:limit(`${recovered?'This condition has recovered.\nPrevious condition: ':''}${alert.details||'No additional details reported.'}`,3000),severity,event:recovered?'resolved':event==='test'?'test':'active',time,color:recovered?0x22c55e:({critical:0xef4444,warning:0xf59e0b,info:0x3b82f6,unknown:0x94a3b8}[severity])};
}
export const statusMarker=n=>n.event==='resolved'?'🟢':({critical:'🔴',warning:'🟠',info:'🔵',unknown:'⚪'}[n.severity]||'⚪');
export const colorHex=n=>'#'+n.color.toString(16).padStart(6,'0');
export const messageHeading=n=>`${statusMarker(n)} ${n.title}`;
export const messageText=n=>`${messageHeading(n)}\nSource: ${n.source}\n${n.details}\n${n.time||'Time not reported'}`;
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const emailCard=n=>`<article style="border-left:5px solid #${n.color.toString(16).padStart(6,'0')};padding:16px;font-family:Arial,sans-serif"><h2>${escapeHTML(messageHeading(n))}</h2><p><strong>Source:</strong> ${escapeHTML(n.source)}</p><p>${escapeHTML(n.details).replace(/\n/g,'<br>')}</p><p>${escapeHTML(n.time||'Time not reported')}</p></article>`;
