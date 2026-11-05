import fs from 'node:fs';
const m = await import('/opt/homebrew/lib/node_modules/rea-agents/dist/domain/evidenceBundle.js');
const d = JSON.parse(fs.readFileSync('ledger_input.json','utf8'));
d.evidence_bundle = m.createEvidenceBundle(d.evidence_bundle.records, []);
fs.writeFileSync('ledger_input.json', JSON.stringify(d));
console.log('exports', Object.keys(m).join(','), 'records', d.evidence_bundle.records.length);
