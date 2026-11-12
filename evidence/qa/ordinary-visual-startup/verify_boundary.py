#!/usr/bin/env python3
"""Static composition checks, not native execution or filesystem observation."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]
source = (ROOT / 'src-tauri/src/visual_qa_profile.rs').read_text()
entry = (ROOT / 'src-tauri/src/lib.rs').read_text()
main = (ROOT / 'src-tauri/src/main.rs').read_text()

start = entry.index('pub fn run()')
assert entry.index('visual_qa_profile::before_startup', start) < entry.index('tauri::Builder::default()', start)
assert main.index('visual_qa_profile::reject_tool_entry()') < main.index('tool_cli::dispatch(')
assert source.index('let Some(root) = std::env::var_os(ROOT_ENV) else { return context }') < source.index('VisualQaProfile::requested(Some(&root)')
assert source.index('profile.environment_values()') < source.index('run_visual(context, profile)')

visual_start = source.index('    fn run_visual(')
visual = source[visual_start:source.index('\n}\n\n#[cfg(not(workspace_std_only))]', visual_start)]
assert re.findall(r'\.plugin\(([^)]+)\)', visual) == ['boundary']
assert '.on_menu_event(' not in visual
for forbidden in ('default_store(', 'BinaryManager', 'request_download(', 'Terminals', 'e2e::install', 'install_at_startup', 'persistence_commands::startup', 'spawn_push_upstream_backfill', 'Command::', 'sidecar_stores::outbox::'):
    assert forbidden not in visual, forbidden
assert visual.index('resolved_paths(app.handle()') < visual.index('crate::db::open(')
assert 'Arc::new(crate::agent::MemorySecretStore::new())' in visual
assert visual.index('private_webkit()') < visual.index('.with_webview_configuration(webkit)') < visual.index('.build()?')
assert 'window.with_webview(' in visual
assert 'configuration().websiteDataStore().isPersistent()' in visual
assert '.disable_javascript(' not in visual and 'about:blank' not in visual

handler = visual.split('.invoke_handler(tauri::generate_handler![', 1)[1].split('])', 1)[0]
actual = [line.strip().rstrip(',') for line in handler.splitlines() if line.strip()]
expected = [
    'crate::app_info',
    'crate::onboarding_commands::db_first_run_onboarding_step',
    'crate::onboarding_commands::db_finish_first_run_onboarding',
    'crate::persistence_commands::db_list_repos',
    'crate::persistence_commands::db_list_workspaces',
    'crate::settings::commands::get_settings',
    'crate::settings::commands::update_settings',
    'crate::settings::commands::initialize_default_runtime',
    'crate::settings::commands::provider_status',
    'crate::app_prefs::commands::get_app_prefs',
    'crate::app_prefs::commands::set_app_pref',
    'crate::app_prefs::commands::client_instance_id',
    'crate::sidebar_transparency::update_window_vibrancy',
]
assert actual == expected, actual
for key in ('OUTBOX_ROOT_ENV', 'COMPLETIONS_DIR_ENV'):
    sidecars = (ROOT / 'src-tauri/src/sidecar_stores/mod.rs').read_text()
    value = re.search(rf'pub const {key}: &str = "([^"]+)"', sidecars).group(1)
    assert f'("{value}",' in source

lock = (ROOT / 'src-tauri/Cargo.lock').read_text()
for crate, version in (('tauri', '2.12.5'), ('tauri-runtime-wry', '2.12.3'), ('wry', '0.57.1'), ('objc2-web-kit', '0.3.2')):
    assert f'name = "{crate}"\nversion = "{version}"' in lock, f're-audit pinned {crate}'

print('PASS: explicit pre-builder opt-in, tool guard, restricted composition, memory secrets, prebuild WebKit configuration and pinned dependency contract')
print('NOT_RUN: native resolver/write observation, actual WebKit readback, installed/package/visual/clone/provider acceptance')
