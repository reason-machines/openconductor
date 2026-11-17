#!/usr/bin/env python3
"""Freeze inert ACP inputs and derive a parser-only probe from unmodified source.

Preparation performs no compile, provider launch, network request or application call.
The separately admitted rustc invocation executes only the resulting parser/serializer.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()
CHAT = 'fixture/workspace-chat'
SESSION = '11111111-1111-4111-8111-111111111111'
CHILD = '22222222-2222-4222-8222-222222222222'
CWD = '/Users/fixture/openconductor/workspace'
REL = 'src/same.txt'
RAW = CWD + '/' + REL
CHILD_RAW = '/home/runner/.reason/workspace/sessions/' + CHILD + '/repo/' + REL
cases = []
def case(id, kind, cloud, raw=RAW, mode='viewer', old=None, extra=False):
    title = {'read': 'Read: src/same.txt', 'edit': 'Edit: src/same.txt', 'write': 'Write: src/same.txt'}[kind]
    content = [{'type': 'content', 'content': {'type': 'text', 'text': 'fixture result: ' + id}}]
    locations = [{'path': raw}]
    if kind != 'read':
        content.append({'type': 'diff', 'path': raw, 'oldText': old, 'newText': 'fixture new\n'})
        if extra:
            content.append({'type': 'diff', 'path': CWD + '/src/second.txt', 'oldText': 'second old\n', 'newText': 'second new\n'})
    update = {'sessionUpdate': 'tool_call_update', 'toolCallId': id, 'title': title, 'kind': 'read' if kind == 'read' else 'edit', 'status': 'completed', 'content': content, 'locations': locations}
    metadata = {'sessionUpdate': 'session_info_update', '_meta': {'com.reasonmachines/computer': {'kind': 'cloud' if cloud else 'headless', 'name': 'Fixture cloud' if cloud else 'Fixture local'}}}
    pending = {k: v for k, v in update.items() if k not in ('content', 'status')}
    pending.update(sessionUpdate='tool_call', status='pending')
    place = 'cloud' if cloud or raw == CHILD_RAW else 'local'
    path_session = CHILD if raw == CHILD_RAW else SESSION if place == 'cloud' else None
    paths = [{'raw': raw, 'relative': REL, 'place': place, **({'sessionId': path_session} if path_session else {})}]
    if extra:
        paths.append({'raw': CWD + '/src/second.txt', 'relative': 'src/second.txt', 'place': place, **({'sessionId': path_session} if path_session else {})})
    cases.append({'id': id, 'kind': kind, 'mode': mode, 'paths': paths, 'output': 'fixture result: ' + id, 'notifications': [{'sessionId': SESSION, 'update': u} for u in (metadata, pending, update)]})
case('local-read-diff', 'read', False, mode='diff')
case('local-read-viewer', 'read', False)
case('cloud-read-diff', 'read', True, mode='diff')
case('cloud-read-viewer', 'read', True)
case('cloud-write-viewer', 'write', True)
case('cloud-edit-diff', 'edit', True, mode='diff', old='fixture old\n')
case('cloud-multiple-diffs', 'edit', True, mode='diff', old='fixture old\n', extra=True)
case('child-literal-viewer', 'read', True, raw=CHILD_RAW)
case('child-literal-diff', 'read', True, raw=CHILD_RAW, mode='diff')
case('local-read-after-return', 'read', False)
case('local-write-after-return', 'write', False)
case('local-edit-after-return', 'edit', False, mode='diff', old='fixture old\n')
inputs = {'schema': 1, 'chatId': CHAT, 'sessionId': SESSION, 'cwd': CWD, 'cases': cases}
(HERE / 'inputs.json').write_text(json.dumps(inputs, indent=2) + '\n')

spans = []
def whole(path):
    blob = (ROOT / path).read_bytes()
    spans.append({'path': path, 'start_byte': 0, 'end_byte': len(blob), 'sha256': sha(blob), 'kind': 'whole-production-module'})
    return blob.decode()
def span(path, name, start, end, kind):
    source = (ROOT / path).read_text()
    text = source[start:end]
    spans.append({'path': path, 'name': name, 'start_byte': len(source[:start].encode()), 'end_byte': len(source[:end].encode()), 'sha256': sha(text.encode()), 'kind': kind, 'text': text})
    return text
provider_path = 'src-tauri/src/reason_acp/provider.rs'
provider = (ROOT / provider_path).read_text()
wire_path = 'src-tauri/src/reason_acp/wire.rs'
wire = (ROOT / wire_path).read_text()
handler = provider.index('fn updates_handler(')
start = provider.index('            let routed = {', handler)
end = provider.index('\n            };', start) + len('\n            };')
route = span(provider_path, 'session-update-routed-block', start, end, 'unmodified-production-routing-block')
whole('src-tauri/src/reason_acp/updates.rs')
serializers = []
for name in ['agent_json', 'tool_json', 'diff_json', 'path_json']:
    match = re.search(r'^(?:pub )?fn ' + name + r'\(', wire, re.M)
    start = match.start()
    end = wire.index('\n}', start) + 2
    serializers.append(span(wire_path, name, start, end, 'unmodified-production-serializer-function'))
start = wire.index('    v["chatId"] = json!(chat);')
envelope = span(wire_path, 'event_json-chat-envelope-tail', start, wire.index('\n}', start), 'unmodified-production-envelope-tail')
start = wire.index('json!({ "type": "sessionStarted", "sessionId": session_id })')
session_expr = span(wire_path, 'session-started-json-expression', start, start + len('json!({ "type": "sessionStarted", "sessionId": session_id })'), 'unmodified-production-wire-expression')
# Only updates.rs is included whole. The routing block and serializer helpers are
# selected byte-for-byte, with inert storage; no provider/process module is compiled.
probe = '''#![allow(dead_code)]
use serde_json::{json, Value};
use std::{collections::HashMap, io::{self, Read}, path::PathBuf, sync::{Arc, Mutex}};
#[path="''' + str(ROOT / 'src-tauri/src/reason_acp/updates.rs') + '''"] mod updates;
mod wire {
use super::updates::{AgentEvent, Diff, MappedPath, Place, ToolRow, ToolStatus};
use serde_json::{json, Value};
''' + '\n\n'.join(serializers) + '''
pub fn fixture_event_json(chat: &str, event: &AgentEvent) -> Value {
    let mut v = agent_json(event);
''' + envelope + '''
}
pub fn fixture_session_json(chat: &str, session_id: &str) -> Value {
    let mut v = ''' + session_expr + ''';
''' + envelope + '''
}
}
use updates::{computer_is_cloud, parse_update, AgentEvent, ReasonError, UpdateContext};
// Inert harness storage contains exactly the fields this production routing arm uses.
#[derive(Default)] struct FixtureTurn { in_text: bool, error: Option<ReasonError> }
struct FixtureChat { cwd: PathBuf, session_id: Option<String>, on_cloud: bool, turn: Option<FixtureTurn> }
#[derive(Default)] struct FixtureShared { by_session: HashMap<String, String>, chats: HashMap<String, FixtureChat> }
fn route_notification(shared: Arc<Mutex<FixtureShared>>, params: &Value) -> Option<(String, AgentEvent)> {
''' + route + '''
    routed
}
fn main() {
    let mut input = String::new(); io::stdin().read_to_string(&mut input).unwrap();
    let v: Value = serde_json::from_str(&input).unwrap();
    let chat = v["chatId"].as_str().unwrap(); let session = v["sessionId"].as_str().unwrap();
    let mut s = FixtureShared::default();
    s.by_session.insert(session.into(), chat.into());
    s.chats.insert(chat.into(), FixtureChat { cwd: v["cwd"].as_str().unwrap().into(), session_id: Some(session.into()), on_cloud: false, turn: Some(FixtureTurn::default()) });
    let shared = Arc::new(Mutex::new(s));
    let mut events = vec![wire::fixture_session_json(chat, session)];
    for c in v["cases"].as_array().unwrap() {
        for params in c["notifications"].as_array().unwrap() {
            if let Some((chat, event)) = route_notification(Arc::clone(&shared), params) {
                events.push(wire::fixture_event_json(&chat, &event));
            }
        }
    }
    // Unknown-session notification must not cross into the owned conversation.
    let unknown = json!({"sessionId":"unregistered-fixture-session","update":{"sessionUpdate":"tool_call","toolCallId":"must-not-route","title":"Read","kind":"read","status":"completed","locations":[{"path":"/fixture/no-route"}]}});
    if let Some((chat, event)) = route_notification(shared, &unknown) {
        events.push(wire::fixture_event_json(&chat, &event));
    }
    println!("{}", serde_json::to_string(&events).unwrap());
}
'''
(HERE / 'probe.rs').write_text(probe)
paths = ['src/features/chat/reasonChat.ts', 'src/features/chat/reason.ts', 'src/features/chat/reducer.ts', 'src/features/chat/persist.ts', 'src/features/chat/view.ts', 'src/features/chat/conductorTools.ts', 'src/features/chat/Transcript.tsx', 'src/features/chat/ToolRows.tsx', 'src/components/WorkspaceView.tsx']
files = {p: sha((ROOT / p).read_bytes()) for p in paths}
files.update({p: sha((ROOT / p).read_bytes()) for p in [provider_path, 'src-tauri/src/reason_acp/updates.rs', wire_path]})
packet = {'id': 'REASON-ACP-CLOUD-PATH-OPEN-IDENTITY-BE7', 'author': 'Conductor Rebuild', 'checked_main': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'inputs_sha256': sha((HERE / 'inputs.json').read_bytes()), 'probe_sha256': sha(probe.encode()), 'production_files': files, 'rust_source_spans': spans, 'limits': ['Inert source-valid ACP fixture, not a recording of current provider execution.', 'No provider/CLI/Tauri/native/browser/package execution; no real-user data.', 'Harness storage and event sink are inert; routing, parser and wire formatter bodies are production source unchanged.', 'No production edits.']}
(HERE / 'source.json').write_text(json.dumps(packet, indent=2) + '\n')
print(json.dumps({'checked_main': packet['checked_main'], 'cases': len(cases), 'tool_clicks': sum(len(c['paths']) for c in cases), 'rust_spans': len(spans), 'source_files': len(files), 'inputs_sha256': packet['inputs_sha256'], 'probe_sha256': packet['probe_sha256'], 'compiled': False}))
