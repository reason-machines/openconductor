const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');
const sourcePath = '.ara-state/home-ejo/retained-renderer.js';
const source = fs.readFileSync(sourcePath, 'utf8');
const tree = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const wanted = new Set(process.argv.slice(2));
const out = '.ara-state/home-archive-keyboard-source';
fs.mkdirSync(out, {recursive:true});
const spans = [];
function visit(node) {
  if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name) && wanted.has(node.name.text)) {
    const name = node.name.text;
    const start = node.getStart(tree), end = node.end;
    const bytes = Buffer.from(source.slice(start, end));
    const file = name + '.txt';
    fs.writeFileSync(`${out}/${file}`, bytes);
    fs.writeFileSync(`${out}/${name}.pretty.txt`, ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, tree));
    spans.push({ name, utf8_span:[Buffer.byteLength(source.slice(0,start)), Buffer.byteLength(source.slice(0,end))], bytes:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex'), file });
  }
  ts.forEachChild(node,visit);
}
visit(tree);
spans.sort((a,b)=>a.utf8_span[0]-b.utf8_span[0]);
fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({ asset:{name:'renderApp-D_fmY7hW.js', bytes:Buffer.byteLength(source),sha256:crypto.createHash('sha256').update(source).digest('hex'),rea_parent_evidence:'ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367'}, spans },null,2)+'\n');
console.log(JSON.stringify(spans.map(({name,bytes})=>({name,bytes}))));
console.log('missing', [...wanted].filter(name=>!spans.some(s=>s.name===name)));
