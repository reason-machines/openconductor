// Static scope/reference inspection only; no original JavaScript is evaluated.
const fs=require('node:fs'), ts=require('typescript'), crypto=require('node:crypto');
const file='.oc-tmp/settings-loader-reference/renderApp-D_fmY7hW.js';
const raw=fs.readFileSync(file), hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(hash(raw)!=='5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde') throw Error('Asset mismatch');
const source=raw.toString('utf8');
const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,false,ts.ScriptKind.JS);
if(sf.parseDiagnostics.length) throw Error('Original source did not parse completely');
const uses=[];
function walk(n,parent){
 if(ts.isIdentifier(n)&&n.text==='pos'){
  const nonReference=parent&&(
   (ts.isPropertyAccessExpression(parent)&&parent.name===n)||
   (ts.isPropertyAssignment(parent)&&parent.name===n)||
   (ts.isBindingElement(parent)&&parent.propertyName===n)||
   ((ts.isMethodDeclaration(parent)||ts.isPropertyDeclaration(parent)||ts.isGetAccessorDeclaration(parent)||ts.isSetAccessorDeclaration(parent))&&parent.name===n)
  );
  if(!nonReference){const start=n.getStart(sf),end=n.end,b=Buffer.from(source.slice(start,end));
   uses.push({kind:ts.SyntaxKind[parent.kind],utf8_half_open:[Buffer.byteLength(source.slice(0,start)),Buffer.byteLength(source.slice(0,end))],sha256:hash(b),context:source.slice(Math.max(0,start-45),end+65)});
  }
 }
 ts.forEachChild(n,c=>walk(c,n));
}
walk(sf);
if(uses.length!==2||uses[0].kind!=='VariableDeclaration'||uses[1].kind!=='CallExpression') throw Error('Context has additional references: '+JSON.stringify(uses));
const result={asset_sha256:hash(raw),parse_diagnostics:0,binding:'pos',non_property_identifier_occurrences:uses,static_conclusion:'Only the context declaration and mos useContext call refer to this unexported binding in the complete retained renderer. No provider or alias reference exists in this asset. aD therefore receives no default debouncer.onUnmount override from this context.',limits:'Static retained-source conclusion only; no original/native/runtime observation.'};
fs.writeFileSync(__dirname+'/context-closure.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
