//! Native QA startup boundary. Test with `rustc --test --cfg workspace_std_only`.

use std::path::{Component, Path, PathBuf};

const QA_IDENTIFIER_PREFIX: &str = "com.reasonmachines.openconductor.qa.";

fn require_debug(debug: bool) -> Result<(), String> {
    if debug {
        Ok(())
    } else {
        Err("native QA requires a debug build".into())
    }
}

fn requires_guard(identifier: &str, root_present: bool, probe: bool) -> bool {
    root_present || probe || identifier.starts_with(QA_IDENTIFIER_PREFIX)
}

fn validate_identifier(identifier: &str) -> Result<(), String> {
    if identifier.starts_with(QA_IDENTIFIER_PREFIX) && identifier.len() > QA_IDENTIFIER_PREFIX.len() {
        Ok(())
    } else {
        Err("native QA requires a unique QA bundle identifier".into())
    }
}

fn absolute_without_traversal(path: &Path) -> Result<(), String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err("native QA paths must be absolute and contain no traversal".into());
    }
    Ok(())
}

fn reject_symlinks(path: &Path) -> Result<(), String> {
    let mut prefix = PathBuf::new();
    for component in path.components() {
        prefix.push(component);
        match std::fs::symlink_metadata(&prefix) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("native QA paths must not contain symlinks".into());
            }
            Ok(metadata) if prefix != path && !metadata.is_dir() => {
                return Err("native QA path ancestor is not a directory".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("cannot inspect native QA path".into()),
        }
    }
    Ok(())
}

fn canonical_root(root: &Path) -> Result<PathBuf, String> {
    absolute_without_traversal(root)?;
    reject_symlinks(root)?;
    let canonical = root
        .canonicalize()
        .map_err(|_| "native QA root must already exist")?;
    if canonical != root || !canonical.is_dir() || canonical.parent().is_none() {
        return Err("native QA root must be a canonical existing non-root directory".into());
    }
    Ok(canonical)
}

fn contained_path(root: &Path, path: &Path) -> Result<(), String> {
    absolute_without_traversal(path)?;
    if !path.starts_with(root) {
        return Err("native QA path escapes the QA root".into());
    }
    reject_symlinks(path)
}

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
fn ordinary_target(dev: bool, bundled_default: bool) -> Result<(), String> {
    if dev || !bundled_default {
        return Err("ordinary QA prerequisite requires bundled local index.html assets".into());
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Probe {
    Paths,
    Webkit,
}

fn probe_request(args: impl IntoIterator<Item = impl AsRef<std::ffi::OsStr>>) -> Result<Option<Probe>, String> {
    let mut probe = None;
    for arg in args {
        let requested = if arg.as_ref() == "--oc-qa-paths" {
            Some(Probe::Paths)
        } else if arg.as_ref() == "--oc-qa-webkit" {
            Some(Probe::Webkit)
        } else {
            None
        };
        if let Some(requested) = requested {
            if probe.is_some() {
                return Err("native QA accepts exactly one probe flag".into());
            }
            probe = Some(requested);
        }
    }
    Ok(probe)
}

#[cfg(not(workspace_std_only))]
mod app {
    use super::*;
    use std::io::Write;
    use tauri::Manager;

    const PROBE_VERSION: &str = "OPENCONDUCTOR_NATIVE_QA_PREFLIGHT_V1";

    fn root() -> Result<PathBuf, String> {
        let value = std::env::var_os("OC_NATIVE_QA_ROOT")
            .ok_or("native QA requires OC_NATIVE_QA_ROOT")?;
        canonical_root(Path::new(&value))
    }

    fn check_environment(root: &Path) -> Result<(), String> {
        for name in ["HOME", "OPENCONDUCTOR_HOME", "OC_E2E_OUT", "TMPDIR"] {
            let value = std::env::var_os(name)
                .ok_or_else(|| format!("native QA requires {name}"))?;
            contained_path(root, Path::new(&value)).map_err(|e| format!("{name}: {e}"))?;
        }
        #[cfg(target_os = "macos")]
        if std::env::var_os("CFFIXED_USER_HOME").is_none() {
            return Err("native QA requires CFFIXED_USER_HOME".into());
        }
        for name in [
            "CFFIXED_USER_HOME",
            "XDG_DATA_HOME",
            "XDG_CONFIG_HOME",
            "XDG_CACHE_HOME",
            crate::sidecar_stores::OUTBOX_ROOT_ENV,
            crate::sidecar_stores::COMPLETIONS_DIR_ENV,
        ] {
            if let Some(value) = std::env::var_os(name) {
                contained_path(root, Path::new(&value)).map_err(|e| format!("{name}: {e}"))?;
            }
        }
        Ok(())
    }

    fn check_config(config: &tauri::Config) -> Result<(), String> {
        require_debug(cfg!(debug_assertions))?;
        validate_identifier(&config.identifier)?;
        if config.app.windows.is_empty()
            || config.app.windows.iter().any(|w| {
                w.create || !w.incognito || w.data_directory.is_some() || w.data_store_identifier.is_some()
            })
        {
            return Err("native QA windows require create:false, incognito:true and no persistent data overrides".into());
        }
        check_environment(&root()?)
    }

    fn receipt(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
        let paths = app.path();
        let data = paths.app_data_dir().map_err(|e| e.to_string())?;
        let settings = crate::settings::config_dir().map_err(|e| e.to_string())?;
        let workspace = crate::workspace::WorkspaceManager::new(data.clone());
        Ok(serde_json::json!({
            "probe_version": PROBE_VERSION,
            "identifier": app.config().identifier,
            "executable": std::env::current_exe().map_err(|e| e.to_string())?,
            "app_data_dir": data,
            "app_config_dir": paths.app_config_dir().map_err(|e| e.to_string())?,
            "app_cache_dir": paths.app_cache_dir().map_err(|e| e.to_string())?,
            "app_local_data_dir": paths.app_local_data_dir().map_err(|e| e.to_string())?,
            "app_log_dir": paths.app_log_dir().map_err(|e| e.to_string())?,
            "settings_file": settings.join(crate::settings::FILE_NAME),
            "database": data.join(crate::db::FILE_NAME),
            "cache_database": data.join(crate::db::CACHE_FILE_NAME),
            "workspace_root": workspace.root(),
            "webview_incognito": app.config().app.windows.iter().all(|w| w.incognito),
        }))
    }

    pub(crate) fn validate(app: &tauri::AppHandle) -> Result<(), String> {
        if !requires_guard(
            &app.config().identifier,
            std::env::var_os("OC_NATIVE_QA_ROOT").is_some(),
            false,
        ) {
            return Ok(());
        }
        check_config(app.config())?;
        let root = root()?;
        let receipt = receipt(app)?;
        for name in [
            "app_data_dir", "app_config_dir", "app_cache_dir", "app_local_data_dir",
            "app_log_dir", "settings_file", "database", "cache_database", "workspace_root",
        ] {
            let path = receipt[name].as_str().ok_or("native QA path is not UTF-8")?;
            contained_path(&root, Path::new(path)).map_err(|e| format!("{name}: {e}"))?;
        }
        let settings = crate::settings::config_dir().map_err(|e| e.to_string())?;
        contained_path(&root, &settings)?;
        let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
        for path in [
            crate::sidecar_stores::outbox_root(&data),
            crate::sidecar_stores::completions_dir(&data),
        ] {
            contained_path(&root, &path)?;
        }
        Ok(())
    }

    pub(crate) fn validate_workspace(root_path: &Path) -> Result<(), String> {
        if std::env::var_os("OC_NATIVE_QA_ROOT").is_some() {
            contained_path(&root()?, root_path)?;
        }
        Ok(())
    }

    pub(crate) fn reject_release_request() {
        let probe = probe_request(std::env::args_os()).unwrap_or_else(|error| refuse(&error));
        if !cfg!(debug_assertions)
            && (probe.is_some() || std::env::var_os("OC_NATIVE_QA_ROOT").is_some())
        {
            refuse("native QA requires a debug build");
        }
        if probe == Some(Probe::Webkit) && !cfg!(target_os = "macos") {
            refuse("WebKit QA requires macOS");
        }
    }

    fn refuse(error: &str) -> ! {
        let _ = writeln!(std::io::stderr(), "Native QA refused: {error}");
        std::process::exit(2)
    }

    pub(crate) fn before_startup(context: tauri::Context<tauri::Wry>) -> tauri::Context<tauri::Wry> {
        let probe = probe_request(std::env::args_os()).unwrap_or_else(|error| refuse(&error));
        if !requires_guard(
            &context.config().identifier,
            std::env::var_os("OC_NATIVE_QA_ROOT").is_some(),
            probe.is_some(),
        ) {
            return context;
        }
        if let Err(error) = check_config(context.config()) {
            refuse(&error);
        }
        #[cfg(all(debug_assertions, target_os = "macos"))]
        if probe == Some(Probe::Webkit) {
            webkit_probe(context);
        }
        if probe == Some(Probe::Paths) {
            // build() exposes the real resolver; run() would execute window creation and setup.
            let builder = tauri::Builder::default();
            #[cfg(target_os = "macos")]
            let builder = builder.enable_macos_default_menu(false);
            let app = builder
                .build(context)
                .unwrap_or_else(|error| refuse(&error.to_string()));
            if let Err(error) = validate(app.handle()) {
                refuse(&error);
            }
            let receipt = receipt(app.handle()).unwrap_or_else(|error| refuse(&error));
            let mut stdout = std::io::stdout().lock();
            if serde_json::to_writer(&mut stdout, &receipt).is_err()
                || writeln!(stdout).is_err()
                || stdout.flush().is_err()
            {
                refuse("cannot write native QA receipt");
            }
            std::process::exit(0);
        }
        context
    }

    #[cfg(all(debug_assertions, target_os = "macos"))]
    fn webkit_probe(context: tauri::Context<tauri::Wry>) -> ! {
        // Wry 0.57.1 navigates during construction. Public with_webview runs later:
        // this observes after an inert about:blank bootstrap, NOT before all navigation.
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(10));
            refuse("WebKit QA timed out");
        });
        let app = tauri::Builder::default()
            .enable_macos_default_menu(false)
            .setup(|app| {
                validate(app.handle()).map_err(std::io::Error::other)?;
                let mut output = receipt(app.handle()).map_err(std::io::Error::other)?;
                let mut config = app.config().app.windows[0].clone();
                config.label = "native-qa-webkit".into();
                config.url = tauri::WebviewUrl::External("about:blank".parse()?);
                config.visible = false;
                config.focus = false;
                config.focusable = false;
                config.devtools = Some(false);
                config.javascript_disabled = true;
                // WindowConfig has no initialization_scripts field in tauri-utils 2.10.2.
                // No application/plugin scripts are added; Tauri still injects core scripts.
                let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                    .disable_javascript()
                    .on_navigation(|_| false)
                    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                    .build()?;
                let visible = window.is_visible()?;
                if visible {
                    refuse("WebKit QA window is visible");
                }
                window.with_webview(move |platform| {
                    if objc2::MainThreadMarker::new().is_none() {
                        refuse("WebKit QA inspection is not on the main thread");
                    }
                    let pointer = platform.inner().cast::<objc2_web_kit::WKWebView>();
                    if pointer.is_null() {
                        refuse("WebKit QA view is unavailable");
                    }
                    // Tauri guarantees a live WKWebView for the duration of this main-thread callback.
                    let persistent = unsafe { (&*pointer).configuration().websiteDataStore().isPersistent() };
                    if persistent {
                        refuse("WebKit QA datastore is persistent");
                    }
                    output["probe_version"] = "OPENCONDUCTOR_NATIVE_QA_WEBKIT_V1".into();
                    output["webkit_data_store_persistent"] = persistent.into();
                    output["native_window_visible"] = visible.into();
                    output["bootstrap_url"] = "about:blank".into();
                    output["javascript_disabled_requested"] = true.into();
                    output["navigation_policy_all_denied"] = true.into();
                    output["new_window_policy_all_denied"] = true.into();
                    output["inspection_after_bootstrap_construction"] = true.into();
                    let mut stdout = std::io::stdout().lock();
                    if serde_json::to_writer(&mut stdout, &output).is_err()
                        || writeln!(stdout).is_err()
                        || stdout.flush().is_err()
                    {
                        refuse("cannot write WebKit QA receipt");
                    }
                    std::process::exit(0);
                })?;
                Ok(())
            })
            .build(context)
            .unwrap_or_else(|error| refuse(&error.to_string()));
        app.run(|_, _| {});
        refuse("WebKit QA exited without a receipt");
    }

    pub(crate) fn ordinary_gate(app: &tauri::AppHandle) -> Result<bool, String> {
        if std::env::var_os("OC_NATIVE_QA_ROOT").is_none() {
            return Ok(false);
        }
        #[cfg(not(all(debug_assertions, target_os = "macos")))]
        {
            let _ = app;
            Err("ordinary QA prerequisite requires a macOS debug bundle".into())
        }
        #[cfg(all(debug_assertions, target_os = "macos"))]
        {
            let config = app.config();
            let main = config.app.windows.first().ok_or("QA main window is missing")?;
            let bundled_default = config.app.windows.len() == 1
                && main.label == "main"
                && matches!(&main.url, tauri::WebviewUrl::App(path) if path == Path::new("index.html"))
                && matches!(&config.build.frontend_dist, Some(tauri::utils::config::FrontendDist::Directory(_)));
            ordinary_target(tauri::is_dev(), bundled_default)?;
            validate(app)?;
            let mut output = receipt(app)?;
            let mut bootstrap = main.clone();
            bootstrap.url = tauri::WebviewUrl::External(
                "about:blank".parse::<tauri::Url>().map_err(|e| e.to_string())?,
            );
            bootstrap.visible = false;
            bootstrap.focus = false;
            bootstrap.focusable = false;
            bootstrap.devtools = Some(false);
            bootstrap.javascript_disabled = true;
            let window = tauri::WebviewWindowBuilder::from_config(app, &bootstrap)
                .map_err(|e| e.to_string())?
                .disable_javascript()
                .on_navigation(|_| false)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build().map_err(|e| e.to_string())?;
            let visible = window.is_visible().map_err(|e| e.to_string())?;
            if visible {
                refuse("ordinary QA prerequisite window is visible");
            }
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_secs(10));
                refuse("ordinary QA prerequisite timed out");
            });
            window.with_webview(move |platform| {
                if objc2::MainThreadMarker::new().is_none() {
                    refuse("ordinary QA inspection is not on the main thread");
                }
                let pointer = platform.inner().cast::<objc2_web_kit::WKWebView>();
                if pointer.is_null() {
                    refuse("ordinary QA view is unavailable");
                }
                // Tauri keeps this WKWebView alive for its main-thread callback.
                let persistent = unsafe { (&*pointer).configuration().websiteDataStore().isPersistent() };
                if persistent {
                    refuse("ordinary QA datastore is persistent");
                }
                output["probe_version"] = "OPENCONDUCTOR_NATIVE_QA_ORDINARY_PREREQUISITE_V1".into();
                output["webkit_data_store_persistent"] = persistent.into();
                output["native_window_visible"] = visible.into();
                output["window_label"] = "main".into();
                output["bootstrap_url"] = "about:blank".into();
                output["app_content_admitted"] = false.into();
                output["ordinary_setup_admitted"] = false.into();
                output["cache_filesystem_verified"] = false.into();
                output["javascript_disabled_requested"] = true.into();
                output["navigation_policy_all_denied"] = true.into();
                output["new_window_policy_all_denied"] = true.into();
                output["inspection_after_bootstrap_construction"] = true.into();
                let mut stdout = std::io::stdout().lock();
                if serde_json::to_writer(&mut stdout, &output).is_err()
                    || writeln!(stdout).is_err() || stdout.flush().is_err()
                {
                    refuse("cannot write ordinary QA prerequisite receipt");
                }
                std::process::exit(0);
            }).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }

    pub(crate) fn guard_builder(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
        if std::env::var_os("OC_NATIVE_QA_ROOT").is_none() {
            return builder;
        }
        // Tauri 2.12.5 initializes plugins in registration order, before app setup.
        builder.plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("native-qa-guard")
                .setup(|app, _| {
                    validate(app).map_err(std::io::Error::other)?;
                    Ok(())
                })
                .build(),
        )
    }
}

#[cfg(not(workspace_std_only))]
pub(crate) use app::{
    before_startup, guard_builder, ordinary_gate, reject_release_request, validate, validate_workspace,
};

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let dir = std::env::temp_dir().canonicalize().unwrap().join(format!(
                "oc-native-qa-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&dir).unwrap();
            Self(dir)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) { std::fs::remove_dir_all(&self.0).unwrap(); }
    }

    #[test]
    fn ordinary_prerequisite_rejects_dev_and_nondefault_targets() {
        assert!(ordinary_target(false, true).is_ok());
        assert!(ordinary_target(true, true).is_err());
        assert!(ordinary_target(false, false).is_err());
        assert!(ordinary_target(true, false).is_err());
    }

    #[test]
    fn probe_flags_are_distinct_and_cannot_be_combined_or_repeated() {
        assert_eq!(probe_request(["app"]).unwrap(), None);
        assert_eq!(probe_request(["app", "--oc-qa-paths"]).unwrap(), Some(Probe::Paths));
        assert_eq!(probe_request(["app", "--oc-qa-webkit"]).unwrap(), Some(Probe::Webkit));
        assert!(probe_request(["--oc-qa-paths", "--oc-qa-webkit"]).is_err());
        assert!(probe_request(["--oc-qa-webkit", "--oc-qa-webkit"]).is_err());
        assert_eq!(probe_request(["--oc-qa-webkit-extra"]).unwrap(), None);
    }

    #[test]
    fn qa_bundle_cannot_skip_guard_when_launched_without_environment() {
        assert!(requires_guard("com.reasonmachines.openconductor.qa.random", false, false));
        assert!(requires_guard("com.reasonmachines.openconductor", true, false));
        assert!(requires_guard("com.reasonmachines.openconductor", false, true));
        assert!(!requires_guard("com.reasonmachines.openconductor", false, false));
    }

    #[test]
    fn release_and_production_identifier_are_refused() {
        assert!(require_debug(false).is_err());
        assert!(require_debug(true).is_ok());
        for id in ["com.reasonmachines.openconductor", QA_IDENTIFIER_PREFIX, "other.qa.test"] {
            assert!(validate_identifier(id).is_err());
        }
        assert!(validate_identifier("com.reasonmachines.openconductor.qa.random").is_ok());
    }

    #[test]
    fn missing_children_are_checked_without_creating_them() {
        let fixture = Fixture::new();
        let root = canonical_root(&fixture.0).unwrap();
        let target = root.join("missing/app/conductor.db");
        contained_path(&root, &target).unwrap();
        assert!(!target.exists());
        assert_eq!(std::fs::read_dir(root).unwrap().count(), 0);
    }

    #[test]
    fn sibling_prefix_relative_and_traversal_are_refused() {
        let fixture = Fixture::new();
        for path in [
            PathBuf::from("relative"), fixture.0.join("child/../../outside"),
            fixture.0.with_extension("sibling").join("data"),
        ] {
            assert!(contained_path(&fixture.0, &path).is_err(), "{path:?}");
        }
        assert!(canonical_root(&fixture.0.join("missing")).is_err());
        assert!(canonical_root(Path::new("/")).is_err());
    }

    #[test]
    fn file_ancestor_is_refused() {
        let fixture = Fixture::new();
        let file = fixture.0.join("file");
        std::fs::write(&file, "").unwrap();
        assert!(contained_path(&fixture.0, &file.join("db")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_root_ancestors_and_dangling_targets_are_refused() {
        let fixture = Fixture::new();
        let link = fixture.0.join("link");
        std::os::unix::fs::symlink("/nonexistent-oc-qa", &link).unwrap();
        assert!(contained_path(&fixture.0, &link.join("db")).is_err());
        assert!(contained_path(&fixture.0, &link).is_err());
        assert!(canonical_root(&link).is_err());
        std::fs::remove_file(&link).unwrap();
        std::os::unix::fs::symlink(&fixture.0, &link).unwrap();
        assert!(contained_path(&fixture.0, &link.join("db")).is_err());
        assert!(canonical_root(&link).is_err());
    }
}
