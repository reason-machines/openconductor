import json, sys, glob
INCLUDE_JS = '--with-js' in sys.argv
O = 'out/'
files = {k: O+k+'.json' for k in ['capture_process_app_start','capture_process_cli_help','extract_artifact_app','inspect_artifact_agentlauncher','inspect_artifact_app','inspect_artifact_runtime','inspect_macho','inspect_plist','inspect_rust_binary','inspect_signature','inspect_signature_runtime','sqlite_cache_migrations','sqlite_cache_schema','sqlite_conductor_migrations','sqlite_conductor_schema','trace_dylib']}
if INCLUDE_JS: files['analyze_js_app_frontend'] = O+'analyze_js_app_frontend.json'
rec = {k: json.load(open(v)) for k,v in files.items()}
E = {k: r['evidence_id'] for k,r in rec.items()}
MAIN='0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d'; RT='5723ead40316bb29e3d0b446cdc82bede489cc75443d6ce08a4e6421ae6eac0d'
CKPT='fd85f6b33d10e6f315a281efcfdd08656ca50f16e68c595089a86efae7f451f1'; BUSY='95c8a1ec161f19cd1dd6b42bdafb62e91c4b2f8c0366a6e5ce8b362666335946'; SPOT='f877d3ed0eb9bca270b8ac05ded0d500add549ab6da68b266426484c6c0b1dae'
FE = E.get('analyze_js_app_frontend')
def ev(*ks): return sorted({E[k] for k in ks if k in E} | ({FE} if FE and 'fe' in ks else set()))
OB = []
def ob(oid, title, layer, family, sha, loc, evs, nxt, orig='static', fix='integration', ver='integration', deps=(), cases=('positive','negative'), disp='active', unavail=()):
    OB.append({'obligation_id':oid,'obligation_version':1,'title':title,'application_layer':layer,'family':family,
      'target':{'artifact_sha256':sha,'application_node_id':None,'semantic_node_id':None,'location':loc},
      'required':True,'required_case_kinds':list(cases),'required_original_authority':orig,'required_fixture_authority':fix,
      'required_verifier_authority':ver,'requires_parser_type':False,'dependency_obligation_ids':list(deps),'residual_unknown_ids':[],
      'unavailable_authority':list(unavail),'required_next_evidence':list(nxt),'disposition':disp,'review_evidence_ids':evs})
G='Ghidra binding of the Rust #[tauri::command] handler'
UI='native UI capture (needs Screen Recording + Accessibility for the REA host)'
# packaging / shell
ob('pkg.bundle','App bundle layout, Info.plist identity, URL scheme and usage strings','packaging','packaging',MAIN,'Contents/Info.plist',ev('inspect_plist','inspect_artifact_app','extract_artifact_app'),['rebuild bundle and diff Info.plist keys'],fix='packaged-process',ver='packaged-process')
ob('pkg.signing','Hardened runtime with JIT, unsigned-executable-memory and audio-input entitlements','packaging','packaging',MAIN,'MacOS/conductor',ev('inspect_signature','inspect_signature_runtime'),['codesign -d of our build'],fix='packaged-process',ver='packaged-process')
ob('pkg.dylibs','Linked system frameworks and dylib load paths (WebKit, AppKit, Security)','native-abi','packaging',MAIN,'MacOS/conductor',ev('inspect_macho','trace_dylib'),['trace-dylib-resolution on our build'],fix='native-abi',ver='native-abi')
ob('pkg.tauri-stack','Tauri 2.11.1 shell with wry 0.55.1/tao 0.35.2 and 13 tauri plugins','runtime','framework',MAIN,'MacOS/conductor (crate panic paths)',ev('inspect_rust_binary','inspect_macho'),['cargo tree of rebuild matches plugin set'])
ob('pkg.embedded-frontend','React/Vite frontend embedded as Tauri asset table (2,902 brotli assets)','packaging','frontend',MAIN,'MacOS/conductor @0x3086910',ev('inspect_macho','fe'),['asset manifest of rebuild'])
ob('pkg.first-run-bootstrap','First run copies bundled bin/ toolchain into App Support and writes ~/.conductor/settings.toml','process','bootstrap',MAIN,'~/Library/Application Support/com.conductor.app/bin',ev('capture_process_app_start'),['capture-process of rebuild first run, compare filesystem effects'],orig='process',fix='packaged-process',ver='packaged-process',cases=('positive','teardown'))
ob('proc.sidecar','Bun sidecar (conductor-runtime sidecar) started and health-checked by the Tauri shell','process','sidecar',RT,'bin/.internal/sidecar; ensure_sidecar_started, check_sidecar_http_health',ev('inspect_artifact_runtime','capture_process_app_start','fe'),[G,'sidecar HTTP route inventory from Bun bundle'],orig='process',fix='packaged-process',ver='packaged-process',cases=('positive','negative','teardown'))
ob('proc.rpc','Bidirectional frontend<->sidecar RPC via rpc_to_sidecar / rpc_from_sidecar','protocol','sidecar',MAIN,'rpc_to_sidecar, rpc_from_sidecar',ev('fe','inspect_macho'),[G,'message schema from Bun bundle'],fix='protocol',ver='protocol',deps=['proc.sidecar'],cases=('positive','malformed','cancellation'))
ob('proc.logger','Logger subprocess with persistence, external-logging toggle and log export','process','telemetry',RT,'bin/.internal/logger; ensure_app_logger_started, export_app_logs, submit_app_logs',ev('fe','inspect_artifact_runtime'),[G])
ob('proc.actions','App-actions channel (ensure_app_actions_started, poll_app_action, submit_app_action_result)','process','actions',RT,'bin/.internal/actions',ev('fe','inspect_artifact_runtime'),[G,'actions protocol from Bun bundle'],deps=['proc.sidecar'])
ob('cli.surface','conductor CLI: auth, project, workspace, section, session, message, routine commands and exit codes','cli','cli',RT,'bin/conductor -> conductor-runtime cli',ev('capture_process_cli_help','inspect_artifact_runtime'),['capture each subcommand --help','authenticated CLI run (needs API token)'],orig='process',fix='packaged-process',ver='packaged-process',cases=('positive','negative','malformed'))
ob('cli.auth-keychain','CLI API token stored in macOS Keychain (auth login/logout/whoami/status)','cli','auth',RT,'conductor auth',ev('capture_process_cli_help'),['keychain item attributes written by rebuild'],orig='process',unavail=['live auth token'])
# persistence
ob('db.conductor-schema','conductor.db schema: repos, workspaces, sessions, session_messages, diff_comments, settings, env_vars, port_forwards, navigation sections (142 sqlx migrations)','persistence','persistence',None,'conductor.db',ev('sqlite_conductor_schema','sqlite_conductor_migrations'),['schema diff of rebuild DB'],fix='unit',ver='unit')
ob('db.cache-schema','cache.db mirror of session_messages plus client cache state and pending-message queue','persistence','persistence',None,'cache.db',ev('sqlite_cache_schema','sqlite_cache_migrations'),['schema diff of rebuild cache DB'],fix='unit',ver='unit',deps=['db.conductor-schema'])
ob('db.local-storage','Encrypted file-backed local storage subsystems (composer drafts, terminal, route state, model picker, turn-changes cache)','persistence','persistence',MAIN,'local-storage.*.json; get_or_create_local_storage_encryption_key',ev('capture_process_app_start','fe'),['format of local-storage.entries files',G])
ob('db.settings-toml','User settings in ~/.conductor/settings.toml with published JSON schema','persistence','settings',None,'~/.conductor/settings.toml',ev('capture_process_app_start'),['fetch/derive settings schema'],orig='process')
# repos / workspaces
ob('repo.add','Add a local or GitHub repository (repos table: remote_url, default_branch, root_path, scripts, custom prompts)','application','repos',None,'/settings/repos',ev('sqlite_conductor_schema','fe'),[UI,G],deps=['db.conductor-schema'])
ob('ws.create','Create workspace as git worktree with branch naming (branch_prefix_type, city-name placeholders)','application','workspaces',None,'/create; workspaces table',ev('sqlite_conductor_schema','fe','capture_process_cli_help'),[UI,'process capture of git worktree add'],deps=['repo.add'],cases=('positive','negative','cancellation'))
ob('ws.setup-run-archive-scripts','Per-repo setup, run (concurrent/exclusive) and archive scripts','process','workspaces',None,'repos.setup_script/run_script/archive_script; /scripts',ev('sqlite_conductor_schema','fe'),['process capture of script execution'],orig='process',deps=['ws.create'])
ob('ws.status-archive','Workspace states, derived/manual status, pin, unread, archive with archive_commit','application','workspaces',None,'workspaces.state/derived_status',ev('sqlite_conductor_schema','fe'),[UI],deps=['ws.create'])
ob('ws.checkpoints','Turn checkpoints as git commits under refs/conductor-checkpoints/<id> (save/restore/diff)','process','git',CKPT,'bin/checkpointer.sh',ev('inspect_artifact_app','extract_artifact_app'),['run checkpointer.sh in a scratch repo under capture-process'],orig='process',fix='integration',ver='integration',cases=('positive','negative','malformed'))
ob('ws.git-busy','Detect in-progress git operations before acting (git-busy-check.sh)','process','git',BUSY,'bin/git-busy-check.sh',ev('inspect_artifact_app'),['capture-process in repo mid-rebase'],orig='process',cases=('positive','negative'))
ob('ws.spotlight','Spotlight testing: sync workspace changes into repo root via watchexec (spotlighter.sh)','process','git',SPOT,'bin/spotlighter.sh; repos.spotlight_testing',ev('inspect_artifact_app','sqlite_conductor_schema'),['capture-process of spotlighter'],orig='process',cases=('positive','teardown'))
ob('ws.file-tree-search','File tree, fuzzy file match and workspace grep','application','files',MAIN,'list_file_tree, fuzzy_match_files, fuzzy_filter_files, grep_workspace',ev('fe'),[G],fix='unit',ver='unit')
# agents / sessions
ob('agent.binaries','Download, verify and manage Claude Code and Codex agent binaries (agent-binaries/ with sha256 meta)','process','agents',MAIN,'agent-binaries/; request_agent_binary_download, get_agent_binary_state',ev('capture_process_app_start','fe'),['network capture of updater endpoint'],orig='process',fix='packaged-process',ver='packaged-process',cases=('positive','negative','cancellation'))
ob('agent.session-run','Start an agent session (claude/codex/opencode) in a workspace and stream messages','application','sessions',RT,'sessions/session_messages; sidecar',ev('sqlite_conductor_schema','fe','inspect_artifact_runtime'),[UI,'sidecar agent protocol from Bun bundle'],deps=['ws.create','agent.binaries','proc.sidecar'],cases=('positive','negative','cancellation'))
ob('agent.message-queue','Queued/pending messages, cancellation and resumable turns','application','sessions',None,'session_messages.queue_order/cancelled_at; session_pending_messages',ev('sqlite_conductor_schema','sqlite_cache_schema'),[UI],deps=['agent.session-run'],cases=('positive','cancellation'))
ob('agent.models','Model picker, favorite models, thinking/effort levels, review model','application','models',None,'favorite_models; settings models.*',ev('sqlite_conductor_schema','capture_process_app_start','fe'),[UI])
ob('agent.providers','Provider credentials (Anthropic API key, Claude provider, Vertex, Codex ChatGPT) in keychain settings','application','providers',MAIN,'get/set/delete_keychain_setting; /settings/user/providers',ev('fe'),[G],unavail=['live provider credentials'])
ob('agent.conductor-skill','Ship a Claude Code plugin/skill that teaches agents the conductor CLI','packaging','agents',None,'Resources/conductor-skill',ev('inspect_artifact_app','extract_artifact_app'),['diff our skill package'])
ob('agent.attachments','Composer attachments and drafts (draft-attachments/, materialize_local_path_attachment)','application','composer',MAIN,'draft-attachments/',ev('fe'),[UI])
ob('agent.speech','Speech-to-text input using microphone','application','composer',MAIN,'NSMicrophoneUsageDescription; audio-input entitlement',ev('inspect_plist','inspect_signature'),[UI])
# terminal
ob('term.pty','Integrated terminal via portable-pty: spawn, write, resize, kill, flow control, history persistence, mirrors','runtime','terminal',MAIN,'pty_* commands',ev('fe','inspect_macho'),[G,'process capture of pty_spawn'],orig='process',cases=('positive','teardown'))
ob('term.shell-exec','Run shell commands (execute_shell_command[_cancellable], cancel)','process','terminal',MAIN,'execute_shell_command',ev('fe'),[G],cases=('positive','cancellation'))
# diff / review / PR
ob('diff.viewer','Diff viewer (Pierre diffs renderer: split/unified, virtualized file diffs, themes)','application','diff',None,'FileDiff, VirtualizedFileDiff, --diffs-* tokens',ev('fe'),[UI],fix='renderer',ver='renderer')
ob('diff.comments','Inline diff comments stored in diff_comments','application','review',None,'diff_comments table; LineComment',ev('sqlite_conductor_schema','fe'),[UI],deps=['diff.viewer'])
ob('pr.create','Create pull request with custom prompts and gh, PR title/description persisted on workspace','application','github',None,'custom_prompt_create_pr; workspaces.pr_title',ev('sqlite_conductor_schema','fe','inspect_artifact_app'),[UI,'process capture of bundled gh'],deps=['ws.create'])
ob('pr.agent-prompts','Repo-level custom prompts: code review, fix errors, resolve merge conflicts, rename branch, general','application','github',None,'repos.custom_prompt_*',ev('sqlite_conductor_schema'),[UI])
# settings / app chrome
ob('ui.routes','Route map: dashboard, all-workspaces, automations, routines, settings (user/org), onboarding, diagnostics','application','frontend',None,'routes.json',ev('fe'),[UI],fix='renderer',ver='renderer')
ob('ui.theme','Dark/light theme tokens and anti-flash background','application','frontend',None,'index.html; css-tokens.json',ev('fe'),[UI],fix='renderer',ver='renderer')
ob('ui.window-chrome','Window vibrancy, traffic-light position, sidebars, dock badge, window state persistence','runtime','window',MAIN,'update_window_vibrancy, update_traffic_light_position, set_dock_badge',ev('fe','inspect_macho'),[G,UI])
ob('ui.notifications','Native notifications and completion sounds','runtime','notifications',MAIN,'send_native_notification; *.mp3 assets',ev('fe'),[UI])
ob('ui.open-in-editor','Open workspace in external apps (Cursor, VS Code, Zed, Xcode, Ghostty)','application','integrations',None,'app-icons/',ev('capture_process_app_start','fe'),[UI])
ob('app.updater','Auto-update via tauri-plugin-updater (check, download, install)','runtime','updater',MAIN,'plugin:updater|*',ev('fe','inspect_rust_binary'),['updater endpoint URL from binary strings'],cases=('positive','negative'))
ob('app.deep-link','Deep links via registered URL scheme','runtime','integrations',MAIN,'CFBundleURLTypes; plugin:deep-link',ev('inspect_plist','fe'),['open URL scheme against rebuild'])
ob('net.port-forward','Port forwarding for workspace dev servers (start/stop, tokens)','protocol','cloud',MAIN,'start_port_forward, stop_port_forward; port_forwards table',ev('fe','sqlite_conductor_schema'),[G],unavail=['cloud account'])
ob('net.remote-file-sync','Remote file sync for cloud workspaces','protocol','cloud',MAIN,'start/stop/trigger_remote_file_sync',ev('fe'),[G],unavail=['cloud account'])
ob('cloud.org','Cloud organization: login, members, sections, cloud workspaces, MCP servers, environment','application','cloud',None,'/login, /members, /settings/organization/*',ev('fe','capture_process_cli_help'),[UI],unavail=['cloud account'])
ob('cloud.routines','Routines/automations triggered by webhook','application','cloud',RT,'/routines, conductor routine create',ev('fe','capture_process_cli_help'),[UI],unavail=['cloud account'])
ob('net.http-proxy','Native HTTP fetch/upload, raw websockets and HTTP proxy config','protocol','network',MAIN,'native_http_*, raw_websocket_*, configure_http_proxy',ev('fe'),[G])
ob('app.telemetry','Sentry and PostHog telemetry with opt-out (enterprise data privacy)','runtime','telemetry',MAIN,'set_posthog_user_context; configure_sentry_external_logging_disabled',ev('fe'),[G])
bundle = {'artifacts':[], 'providers':[], 'environments':[], 'scenarios':[], 'captures':[], 'unknowns':[], 'records':list(rec.values())}
seen=set(); pv=set(); en=set()
for r in rec.values():
    s=r['subject']
    if s and s['digest']['sha256'] not in seen: seen.add(s['digest']['sha256']); bundle['artifacts'].append({'digest':s['digest'],'format':s['format'],'architecture':s['architecture']})
    p=r['provider']
    if p['id'] not in pv: pv.add(p['id']); bundle['providers'].append(p)
    e=r.get('environment')
    if e and e['id'] not in en: en.add(e['id']); bundle['environments'].append(e)
    if r['predicate_type']=='rea.process-capture':
        bundle['captures'].append({'evidence_id':r['evidence_id'],'predicate_type':r['predicate_type']})
        bundle['scenarios'].append({'evidence_id':r['evidence_id'],'operation':r['operation'],'authority':r['authority']})
json.dump({'evidence_bundle':bundle,'reviewed_obligations':OB,'manifest':{'bindings':[],'contradictions':[]}}, open('ledger_input.json','w'))
print('obligations', len(OB), 'records', len(rec))
