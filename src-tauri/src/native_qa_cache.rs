//! Synthetic storage lifecycle prerequisite, never ordinary application content.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Phase {
    Write,
    Read,
}

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
impl Phase {
    fn name(self) -> &'static str {
        match self {
            Self::Write => "write",
            Self::Read => "read",
        }
    }

    fn expected(self) -> &'static str {
        match self {
            Self::Write => "written-read-back",
            Self::Read => "absent",
        }
    }
}

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
fn valid_token(token: &str) -> bool {
    token.len() == 32 && token.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
fn guarded_fixture(identifier: &str, root: &std::path::Path, override_path: Option<&std::path::Path>) -> bool {
    identifier.strip_prefix("com.reasonmachines.openconductor.qa.").is_some_and(valid_token)
        && override_path == Some(root.join("app-data").as_path())
}

#[cfg(all(debug_assertions, target_os = "macos", not(workspace_std_only)))]
mod native {
    use super::*;
    use std::io::Write;
    use std::sync::{atomic::{AtomicBool, Ordering}, Arc};

    const VERSION: &str = "OPENCONDUCTOR_NATIVE_QA_STORAGE_STAGE_V1";

    struct ProbeState {
        phase: Phase,
        token: String,
        inspected: Arc<AtomicBool>,
    }

    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct StorageResult {
        phase: String,
        local_storage: String,
        indexed_db: String,
        cache_storage: String,
    }

    fn refuse(reason: &str) -> ! {
        eprintln!("native QA storage stage refused: {reason}");
        std::process::exit(2);
    }

    #[tauri::command]
    fn storage_failure() {
        refuse("synthetic storage operation failed");
    }

    #[tauri::command]
    fn storage_result(state: tauri::State<'_, ProbeState>, result: StorageResult) {
        if !state.inspected.load(Ordering::SeqCst)
            || result.phase != state.phase.name()
            || [&result.local_storage, &result.indexed_db, &result.cache_storage]
                .into_iter().any(|value| value != state.phase.expected())
        {
            refuse("missing inspection or failed synthetic storage operation");
        }
        let output = serde_json::json!({
            "probe_version": VERSION,
            "phase": state.phase.name(),
            "token": state.token,
            "pid": std::process::id(),
            "webkit_data_store_persistent": false,
            "inspection_after_inert_bootstrap": true,
            "native_window_visible": false,
            "ordinary_app_content_admitted": false,
            "synthetic_content_only": true,
            "filesystem_coverage_verified": false,
            "local_storage": result.local_storage,
            "indexed_db": result.indexed_db,
            "cache_storage": result.cache_storage,
        });
        let mut stdout = std::io::stdout().lock();
        if serde_json::to_writer(&mut stdout, &output).is_err()
            || writeln!(stdout).is_err() || stdout.flush().is_err()
        {
            refuse("cannot emit storage-stage receipt");
        }
        std::process::exit(0);
    }

    pub(super) fn run(context: tauri::Context<tauri::Wry>, phase: Phase) -> ! {
        let token = std::env::var("OC_NATIVE_QA_STORAGE_TOKEN")
            .ok().filter(|value| valid_token(value))
            .unwrap_or_else(|| refuse("missing valid synthetic fixture token"));
        if tauri::is_dev() {
            refuse("storage stage requires a bundled debug build");
        }
        let config = context.config();
        let root = std::env::var_os("OC_NATIVE_QA_ROOT")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| refuse("missing guarded QA root"));
        let override_path = match &config.app.app_directories_override {
            Some(tauri::utils::config::AppDirectoriesOverride::Root(path)) => Some(path.as_path()),
            _ => None,
        };
        if !guarded_fixture(&config.identifier, &root, override_path) {
            refuse("storage stage requires the exact random-identity QA root override");
        }
        if config.app.windows.len() != 1
            || config.app.windows[0].label != "main"
            || !matches!(&config.app.windows[0].url, tauri::WebviewUrl::App(path) if path == std::path::Path::new("index.html"))
            || !matches!(&config.build.frontend_dist, Some(tauri::utils::config::FrontendDist::Directory(_)))
        {
            refuse("storage stage requires bundled default main-window assets");
        }
        let script = include_str!("native_qa_storage.mjs");
        let html = format!(
            "<!doctype html><meta charset=utf-8><script type=module>{script}\n\
             storageStage({:?},{:?}).then(result=>window.__TAURI_INTERNALS__.invoke(\
             'storage_result',{{result}})).catch(()=>window.__TAURI_INTERNALS__.invoke(\
             'storage_failure'));</script>",
            phase.name(), token
        );
        let inspected = Arc::new(AtomicBool::new(false));
        let permit = Arc::new(AtomicBool::new(false));
        let state = ProbeState { phase, token, inspected: inspected.clone() };
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(12));
            refuse("storage stage timed out");
        });
        let app = tauri::Builder::default()
            .enable_macos_default_menu(false)
            .manage(state)
            .invoke_handler(tauri::generate_handler![storage_result, storage_failure])
            // Replace bundled application assets only inside this separate QA-only
            // builder. No ordinary application page or command is registered here.
            .register_uri_scheme_protocol("tauri", move |_, request| {
                let valid = request.uri().authority().map(|a| a.as_str()) == Some("localhost")
                    && request.uri().path() == "/" && request.uri().query().is_none();
                tauri::http::Response::builder()
                    .status(if valid { 200 } else { 403 })
                    .header("Content-Type", "text/html; charset=utf-8")
                    .header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; connect-src ipc: http://ipc.localhost")
                    .body(if valid { html.as_bytes().to_vec() } else { Vec::new() })
                    .expect("fixed synthetic response headers")
            })
            .setup(move |app| {
                crate::native_qa::validate(app.handle()).map_err(std::io::Error::other)?;
                let mut config = app.config().app.windows[0].clone();
                config.url = tauri::WebviewUrl::External("about:blank".parse()?);
                config.visible = false;
                config.focus = false;
                config.focusable = false;
                config.devtools = Some(false);
                // JS is enabled only for our synthetic payload; no app assets load.
                config.javascript_disabled = false;
                let navigation = permit.clone();
                let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                    .on_navigation(move |url| url.as_str() == "about:blank"
                        || (navigation.load(Ordering::SeqCst) && url.as_str() == "tauri://localhost/"))
                    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                    .build()?;
                if window.is_visible()? {
                    refuse("synthetic window is visible");
                }
                let target = window.clone();
                window.with_webview(move |platform| {
                    if objc2::MainThreadMarker::new().is_none() {
                        refuse("datastore inspection is not on main thread");
                    }
                    let pointer = platform.inner().cast::<objc2_web_kit::WKWebView>();
                    if pointer.is_null() {
                        refuse("native view unavailable");
                    }
                    // Tauri owns this WKWebView during its main-thread callback.
                    if unsafe { (&*pointer).configuration().websiteDataStore().isPersistent() } {
                        refuse("synthetic datastore is persistent");
                    }
                    inspected.store(true, Ordering::SeqCst);
                    permit.store(true, Ordering::SeqCst);
                    // Tauri 2.12.5's bundled/default macOS protocol; dev/remote
                    // configurations were rejected above. Never resolve arbitrary URLs.
                    if target.navigate("tauri://localhost/".parse().expect("fixed QA URL")).is_err() {
                        refuse("cannot navigate to synthetic payload");
                    }
                })?;
                Ok(())
            })
            .build(context).unwrap_or_else(|error| refuse(&error.to_string()));
        app.run(|_, _| {});
        refuse("storage stage exited without a receipt");
    }
}

#[cfg(not(workspace_std_only))]
pub(crate) fn run(context: tauri::Context<tauri::Wry>, phase: Phase) -> ! {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    native::run(context, phase);
    #[cfg(not(all(debug_assertions, target_os = "macos")))]
    {
        let _ = (context, phase);
        eprintln!("native QA storage stage requires a macOS debug bundle");
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn phase_expectations_are_distinct() {
        assert_eq!(Phase::Write.name(), "write");
        assert_eq!(Phase::Write.expected(), "written-read-back");
        assert_eq!(Phase::Read.name(), "read");
        assert_eq!(Phase::Read.expected(), "absent");
    }
    #[test]
    fn storage_fixture_requires_random_identity_and_exact_root_override() {
        use std::path::Path;
        let root = Path::new("/private/qa");
        let id = format!("com.reasonmachines.openconductor.qa.{}", "a".repeat(32));
        assert!(guarded_fixture(&id, root, Some(Path::new("/private/qa/app-data"))));
        assert!(!guarded_fixture(&id, root, None));
        assert!(!guarded_fixture(&id, root, Some(Path::new("/private/qa/other"))));
        assert!(!guarded_fixture("com.reasonmachines.openconductor.qa.random", root, Some(Path::new("/private/qa/app-data"))));
        assert!(!guarded_fixture("com.reasonmachines.openconductor", root, Some(Path::new("/private/qa/app-data"))));
    }

    #[test]
    fn token_is_only_a_bounded_hex_fixture_identity() {
        assert!(valid_token(&"a".repeat(32)));
        for value in ["a".repeat(31), "a".repeat(33), "A".repeat(32), "/".repeat(32)] {
            assert!(!valid_token(&value));
        }
    }
}
