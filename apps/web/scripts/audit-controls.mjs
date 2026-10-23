import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),files=[],issues=[];
for(const folder of ['','pages','components'])for(const name of fs.readdirSync(path.join(root,'src',folder)).filter(n=>n.endsWith('.tsx')).sort()){
 const relative=path.posix.join('src',folder,name),source=ts.createSourceFile(relative,fs.readFileSync(path.join(root,relative),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),buttons=[];
 function walk(node){
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='button'){
   const props=node.openingElement.attributes.properties,attrs=new Map(props.filter(ts.isJsxAttribute).map(a=>[a.name.getText(source),a.initializer?.getText(source)]));let form=false,parent=node.parent;
   while(parent){if(ts.isJsxElement(parent)&&parent.openingElement.tagName.getText(source)==='form'){form=true;break}parent=parent.parent}
   const line=source.getLineAndCharacterOfPosition(node.pos).line+1,label=node.children.map(c=>ts.isJsxText(c)?c.text.trim():'').filter(Boolean).join(' ')||attrs.get('aria-label')||attrs.get('title')||'(dynamic/icon)',handler=attrs.get('onClick'),type=attrs.get('type');
   buttons.push({line,label,handler:handler?.slice(0,160)||null,form,type:type||'default',guarded:attrs.has('disabled')});
   if(!handler&&!props.some(ts.isJsxSpreadAttribute)&&(!form||type==='"button"'))issues.push({file:relative,line,issue:'Button has no click handler or enclosing form submission'});
   if(handler&&form&&!type)issues.push({file:relative,line,issue:'Click action inside a form has an implicit submit type'});
   if(handler&&/^\{\s*\([^)]*\)\s*=>\s*\{\s*\}\s*\}$/.test(handler))issues.push({file:relative,line,issue:'Empty click handler'});
  }
  ts.forEachChild(node,walk);
 }walk(source);files.push({file:relative,buttons});
}
const report={scope:'Static JSX button templates in pages and components; runtime provider actions require separate verification',files:files.length,buttons:files.reduce((n,f)=>n+f.buttons.length,0),issues,inventory:files};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));else{console.log(`${report.buttons} button templates across ${report.files} files; ${issues.length} static wiring issues.`);for(const issue of issues)console.log(`${issue.file}:${issue.line}: ${issue.issue}`)}
if(issues.length)process.exitCode=1;
