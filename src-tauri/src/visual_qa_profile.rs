//! Private storage for an ordinary, JavaScript-enabled visual QA launch.

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
use std::ffi::{OsStr, OsString};
#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
use std::fs::{self, OpenOptions};
#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
use std::path::{Component, Path, PathBuf};

pub(crate) const ROOT_ENV: &str = "OC_VISUAL_QA_ROOT";

fn with_startup_admission<T>(requested: bool, startup: impl FnOnce() -> T) -> Result<T, &'static str> {
    if requested {
        return Err("trusted process-family filesystem prevention is unavailable; visual QA admission denied");
    }
    Ok(startup())
}

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
#[derive(Debug)]
pub(crate) struct VisualQaProfile {
    root: PathBuf,
}

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
fn canonical_directory(path: &Path) -> Result<(), String> {
    if !path.is_absolute()
        || path.parent().is_none()
        || path.components().any(|part| matches!(part, Component::ParentDir))
    {
        return Err("visual QA needs an absolute, non-root path without traversal".into());
    }
    let mut prefix = PathBuf::new();
    for part in path.components() {
        prefix.push(part);
        let metadata = fs::symlink_metadata(&prefix)
            .map_err(|e| format!("cannot inspect visual QA directory: {e}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("visual QA paths must be real directories, not symlinks".into());
        }
    }
    if path.canonicalize().map_err(|e| e.to_string())? != path {
        return Err("visual QA needs a canonical directory".into());
    }
    Ok(())
}

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
impl VisualQaProfile {
    pub(crate) fn requested(value: Option<&OsStr>, debug: bool) -> Result<Option<Self>, String> {
        let Some(value) = value else { return Ok(None) };
        if !debug {
            return Err("visual QA requires a debug build".into());
        }
        let root = Path::new(value);
        canonical_directory(root)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::{MetadataExt, PermissionsExt};
            unsafe extern "C" { fn geteuid() -> u32; }
            let metadata = fs::metadata(root).map_err(|e| e.to_string())?;
            // geteuid has no arguments or memory preconditions on Unix.
            let owner = unsafe { geteuid() };
            if metadata.uid() != owner || metadata.permissions().mode() & 0o077 != 0 {
                return Err("visual QA root must be owned by this user and private (mode 0700)".into());
            }
        }
        if fs::read_dir(root).map_err(|e| e.to_string())?.next().is_some() {
            return Err("visual QA requires a fresh empty directory for each launch".into());
        }
        let mut claim = OpenOptions::new();
        claim.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            claim.mode(0o600);
        }
        claim.open(root.join(".visual-qa-profile"))
            .map_err(|e| format!("cannot reserve visual QA root: {e}"))?;
        let profile = Self { root: root.to_path_buf() };
        for (_, path) in profile.environment() {
            fs::create_dir_all(&path).map_err(|e| format!("cannot create private visual QA directory: {e}"))?;
        }
        Ok(Some(profile))
    }

    pub(crate) fn root(&self) -> &Path {
        &self.root
    }

    pub(crate) fn environment(&self) -> Vec<(&'static str, PathBuf)> {
        [
            ("HOME", "home"),
            ("CFFIXED_USER_HOME", "home"),
            ("OPENCONDUCTOR_HOME", "settings"),
            ("XDG_CONFIG_HOME", "config"),
            ("XDG_DATA_HOME", "data"),
            ("XDG_CACHE_HOME", "cache"),
            ("TMPDIR", "tmp"),
            ("TMP", "tmp"),
            ("TEMP", "tmp"),
            ("CONDUCTOR_SESSION_EVENT_OUTBOX_ROOT", "outbox"),
            ("CONDUCTOR_SIDECAR_V2_COMPLETIONS_DIR", "completions"),
        ].into_iter().map(|(name, child)| (name, self.root.join(child))).collect()
    }

    pub(crate) fn check_path(&self, path: &Path) -> Result<(), String> {
        if !path.is_absolute() || !path.starts_with(&self.root)
            || path.components().any(|part| matches!(part, Component::ParentDir))
        {
            return Err("visual QA storage escapes its private root".into());
        }
        let mut prefix = PathBuf::new();
        for part in path.components() {
            prefix.push(part);
            match fs::symlink_metadata(&prefix) {
                Ok(m) if m.file_type().is_symlink() => return Err("visual QA storage contains a symlink".into()),
                Ok(m) if prefix != path && !m.is_dir() => return Err("visual QA storage ancestor is not a directory".into()),
                Ok(_) => {},
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
                Err(e) => return Err(format!("cannot inspect visual QA storage: {e}")),
            }
        }
        Ok(())
    }

    pub(crate) fn environment_values(&self) -> Vec<(&'static str, OsString)> {
        self.environment().into_iter().map(|(name, path)| (name, path.into_os_string())).collect()
    }
}

#[cfg(not(workspace_std_only))]
mod app {
    use super::*;
    use std::io::Write;

    fn refuse(error: &str) -> ! {
        let _ = writeln!(std::io::stderr(), "Visual QA refused: {error}");
        std::process::exit(2)
    }

    pub fn reject_tool_entry() {
        if std::env::var_os(ROOT_ENV).is_some()
            && std::env::args_os().any(|arg| arg == "--tool")
        {
            refuse("visual QA cannot dispatch bundled tools");
        }
    }

    pub(crate) fn before_startup(context: tauri::Context<tauri::Wry>) -> tauri::Context<tauri::Wry> {
        let root = std::env::var_os(ROOT_ENV);
        match with_startup_admission(root.is_some(), || configure_profile(context, root)) {
            Ok(context) => context,
            Err(error) => refuse(error),
        }
    }

    fn configure_profile(mut context: tauri::Context<tauri::Wry>, root: Option<std::ffi::OsString>) -> tauri::Context<tauri::Wry> {
        let Some(root) = root else { return context };
        #[cfg(not(all(debug_assertions, target_os = "macos")))]
        {
            let _ = (&mut context, root);
            refuse("ordinary visual QA requires a macOS debug bundle");
        }
        #[cfg(all(debug_assertions, target_os = "macos"))]
        {
            if std::env::var_os("OC_NATIVE_QA_ROOT").is_some()
                || std::env::var_os("OC_E2E_SCRIPT").is_some()
                || std::env::args_os().any(|arg| arg.to_string_lossy().starts_with("--oc-qa-"))
            {
                refuse("visual QA cannot be combined with another QA driver");
            }
            let config = context.config();
            if tauri::is_dev()
                || config.app.windows.len() != 1
                || !matches!(&config.build.frontend_dist, Some(tauri::utils::config::FrontendDist::Directory(_)))
            {
                refuse("visual QA requires the ordinary bundled index window");
            }
            let window = &config.app.windows[0];
            if window.create || window.label != "main" || window.javascript_disabled
                || !matches!(&window.url, tauri::WebviewUrl::App(path) if path == Path::new("index.html"))
            {
                refuse("visual QA requires create:false and JavaScript-enabled local index.html");
            }
            let profile = VisualQaProfile::requested(Some(&root), true)
                .unwrap_or_else(|error| refuse(&error)).unwrap();
            for (name, value) in profile.environment_values() {
                std::env::set_var(name, value);
            }
            let window = &mut context.config_mut().app.windows[0];
            window.incognito = true;
            window.data_directory = None;
            window.data_store_identifier = None;
            run_visual(context, profile)
        }
    }

    #[cfg(all(debug_assertions, target_os = "macos"))]
    fn resolved_paths(app: &tauri::AppHandle, profile: &VisualQaProfile) -> Result<serde_json::Value, String> {
        use tauri::Manager;
        let resolver = app.path();
        let paths = [
            ("app_data_dir", resolver.app_data_dir().map_err(|e| e.to_string())?),
            ("app_config_dir", resolver.app_config_dir().map_err(|e| e.to_string())?),
            ("app_local_data_dir", resolver.app_local_data_dir().map_err(|e| e.to_string())?),
            ("app_cache_dir", resolver.app_cache_dir().map_err(|e| e.to_string())?),
            ("app_log_dir", resolver.app_log_dir().map_err(|e| e.to_string())?),
            ("settings", crate::settings::config_dir().map_err(|e| e.to_string())?),
            ("temp", std::env::temp_dir()),
        ];
        let mut result = serde_json::Map::new();
        for (name, path) in paths {
            profile.check_path(&path)?;
            result.insert(name.into(), serde_json::json!(path));
        }
        let data = resolver.app_data_dir().map_err(|e| e.to_string())?;
        for (name, path) in [
            ("outbox", crate::sidecar_stores::outbox_root(&data)),
            ("completions", crate::sidecar_stores::completions_dir(&data)),
            ("database", data.join(crate::db::FILE_NAME)),
            ("cache_database", data.join(crate::db::CACHE_FILE_NAME)),
        ] {
            profile.check_path(&path)?;
            result.insert(name.into(), serde_json::json!(path));
        }
        Ok(result.into())
    }

    #[cfg(all(debug_assertions, target_os = "macos"))]
    fn private_webkit() -> Result<objc2::rc::Retained<objc2_web_kit::WKWebViewConfiguration>, String> {
        use objc2_web_kit::{WKWebViewConfiguration, WKWebsiteDataStore};
        let main = objc2::MainThreadMarker::new().ok_or("visual QA WebKit needs the main thread")?;
        // The marker proves main-thread access; both objects are freshly owned.
        unsafe {
            let configuration = WKWebViewConfiguration::new(main);
            let store = WKWebsiteDataStore::nonPersistentDataStore(main);
            if store.isPersistent() {
                return Err("visual QA WebKit store is persistent".into());
            }
            configuration.setWebsiteDataStore(&store);
            if configuration.websiteDataStore().isPersistent() {
                return Err("visual QA WebKit configuration lost its private store".into());
            }
            Ok(configuration)
        }
    }

    #[cfg(all(debug_assertions, target_os = "macos"))]
    fn executable_digest() -> Result<String, String> {
        use sha2::{Digest, Sha256};
        use std::io::Read;
        let mut file = fs::File::open(std::env::current_exe().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut buffer = [0; 65536];
        loop {
            let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 { break }
            hash.update(&buffer[..count]);
        }
        Ok(format!("{:x}", hash.finalize()))
    }

    #[cfg(all(debug_assertions, target_os = "macos"))]
    fn run_visual(context: tauri::Context<tauri::Wry>, profile: VisualQaProfile) -> ! {
        use std::sync::Arc;
        use tauri::Manager;
        let profile = Arc::new(profile);
        let validate_profile = profile.clone();
        let setup_profile = profile.clone();
        let boundary = tauri::plugin::Builder::<tauri::Wry>::new("visual-qa-boundary")
            .setup(move |app, _| {
                resolved_paths(app, &validate_profile).map_err(std::io::Error::other)?;
                Ok(())
            }).build();
        let app = tauri::Builder::default()
            .enable_macos_default_menu(false)
            .plugin(boundary)
            .setup(move |app| {
                let paths = resolved_paths(app.handle(), &setup_profile).map_err(std::io::Error::other)?;
                let data = app.path().app_data_dir()?;
                let db = crate::db::open(&data)?;
                let transparent = crate::sidebar_transparency::startup_enabled(&db.0);
                let settings = crate::settings::service::SettingsService::new(
                    crate::settings::config_dir()?.join(crate::settings::FILE_NAME),
                    Arc::new(crate::agent::MemorySecretStore::new()),
                ).with_db(db.0.clone());
                app.manage(crate::db::open_cache(&data));
                app.manage(crate::local_storage_commands::state(&data));
                app.manage(settings);
                app.manage(db);
                let config = app.config().app.windows[0].clone();
                let webkit = private_webkit().map_err(std::io::Error::other)?;
                let window = tauri::WebviewWindowBuilder::from_config(app, &config)?
                    .with_webview_configuration(webkit)
                    .transparent(transparent)
                    .build()?;
                let root = setup_profile.root().to_path_buf();
                let identity = app.config().identifier.clone();
                window.with_webview(move |platform| {
                    let pointer = platform.inner().cast::<objc2_web_kit::WKWebView>();
                    if pointer.is_null() { refuse("visual QA webview is unavailable") }
                    // The callback borrows Tauri's live main-thread WKWebView.
                    let persistent = unsafe { (&*pointer).configuration().websiteDataStore().isPersistent() };
                    if persistent { refuse("visual QA webview lost its nonpersistent store") }
                    let receipt = serde_json::json!({
                        "receipt_version": "OPENCONDUCTOR_VISUAL_QA_V1",
                        "profile_root": root,
                        "identifier": identity,
                        "source_commit": option_env!("GITHUB_SHA"),
                        "executable": std::env::current_exe().ok(),
                        "executable_sha256": executable_digest().unwrap_or_else(|e| refuse(&e)),
                        "package_identity": "requires external acceptance receipt",
                        "resolved_paths": paths,
                        "resolved_before_product_setup": true,
                        "third_party_plugins": "not-registered",
                        "core_path_plugin": "resolver-state-only",
                        "webkit_prebuild_nonpersistent": true,
                        "webkit_readback_persistent": persistent,
                        "bundled_index_javascript_enabled": true,
                        "secret_store": "memory-only",
                        "startup_tools_downloads_imports_backfill": "skipped",
                        "provider_clone_terminal_commands": "not-registered",
                        "normal_backend_parity": false,
                        "os_filesystem_containment_verified": false,
                    });
                    let path = root.join("visual-startup-receipt.json");
                    let mut file = OpenOptions::new().write(true).create_new(true).open(path)
                        .unwrap_or_else(|e| refuse(&e.to_string()));
                    serde_json::to_writer_pretty(&mut file, &receipt).unwrap_or_else(|e| refuse(&e.to_string()));
                })?;
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                crate::app_info,
                crate::onboarding_commands::db_first_run_onboarding_step,
                crate::onboarding_commands::db_finish_first_run_onboarding,
                crate::persistence_commands::db_list_repos,
                crate::persistence_commands::db_list_workspaces,
                crate::sidebar_section_commands::db_read_navigation_sections,
                crate::local_storage_commands::local_storage_get_entry,
                crate::settings::commands::get_settings,
                crate::settings::commands::update_settings,
                crate::settings::commands::initialize_default_runtime,
                crate::settings::commands::provider_status,
                crate::app_prefs::commands::get_app_prefs,
                crate::app_prefs::commands::set_app_pref,
                crate::app_prefs::commands::client_instance_id,
                crate::sidebar_transparency::update_window_vibrancy,
            ])
            .build(context).unwrap_or_else(|e| refuse(&e.to_string()));
        app.run(|_, _| {});
        std::process::exit(0)
    }
}

#[cfg(not(workspace_std_only))]
pub use app::reject_tool_entry;
#[cfg(not(workspace_std_only))]
pub(crate) use app::before_startup;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Root(PathBuf);
    impl Root {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let root = std::env::temp_dir().canonicalize().unwrap()
                .join(format!("oc-visual-profile-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir(&root).unwrap();
            #[cfg(unix)] {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
            }
            Self(root)
        }
        fn prepare(&self) -> Result<VisualQaProfile, String> {
            VisualQaProfile::requested(Some(self.0.as_os_str()), true).map(Option::unwrap)
        }
    }
    impl Drop for Root {
        fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
    }

    #[test]
    fn uncontained_request_never_enters_startup_or_reserves_profile() {
        let root = Root::new();
        let entered = std::cell::Cell::new(false);
        let result = with_startup_admission(true, || {
            entered.set(true);
            root.prepare()
        });
        assert!(result.is_err(), "an uncontained visual request reached startup");
        assert!(!entered.get());
        assert_eq!(fs::read_dir(&root.0).unwrap().count(), 0);
    }

    #[test]
    fn absent_request_preserves_startup_result() {
        let context = String::from("ordinary startup context");
        assert_eq!(with_startup_admission(false, || context).unwrap(), "ordinary startup context");
    }

    #[test]
    fn absent_request_is_a_noop_even_in_release() {
        assert_eq!(ROOT_ENV, "OC_VISUAL_QA_ROOT");
        assert!(VisualQaProfile::requested(None, false).unwrap().is_none());
    }

    #[test]
    fn release_refuses_before_touching_disk() {
        let root = Root::new();
        assert!(VisualQaProfile::requested(Some(root.0.as_os_str()), false).is_err());
        assert_eq!(fs::read_dir(&root.0).unwrap().count(), 0);
    }

    #[test]
    fn private_roots_are_real_and_separate_per_launch() {
        let a = Root::new();
        let b = Root::new();
        let first = a.prepare().unwrap();
        let second = b.prepare().unwrap();
        assert_eq!(first.root(), a.0);
        assert_ne!(first.root(), second.root());
        for (_, path) in first.environment_values() {
            let path = PathBuf::from(path);
            assert!(path.is_dir());
            first.check_path(&path).unwrap();
            assert!(second.check_path(&path).is_err());
        }
    }

    #[test]
    fn existing_state_is_never_imported_or_reused() {
        let root = Root::new();
        fs::write(root.0.join("settings.toml"), "protected sentinel").unwrap();
        assert!(root.prepare().is_err());
        assert_eq!(fs::read_to_string(root.0.join("settings.toml")).unwrap(), "protected sentinel");
        assert!(!root.0.join("home").exists());
        fs::remove_file(root.0.join("settings.toml")).unwrap();
        root.prepare().unwrap();
        assert!(root.prepare().is_err());
    }

    #[test]
    fn simultaneous_requests_admit_exactly_one_profile() {
        let root = Root::new();
        let handles: Vec<_> = (0..8).map(|_| {
            let path = root.0.clone();
            std::thread::spawn(move || VisualQaProfile::requested(Some(path.as_os_str()), true).is_ok())
        }).collect();
        assert_eq!(handles.into_iter().map(|handle| handle.join().unwrap()).filter(|admitted| *admitted).count(), 1);
    }

    #[test]
    fn invalid_paths_fail_without_creating_them() {
        for path in ["", ".", "relative", "/", "/nonexistent-oc-visual-profile", "/tmp/../tmp"] {
            assert!(VisualQaProfile::requested(Some(OsStr::new(path)), true).is_err(), "{path}");
        }
    }

    #[test]
    fn resolver_escape_and_parent_components_are_rejected() {
        let root = Root::new();
        let profile = root.prepare().unwrap();
        assert!(profile.check_path(Path::new("/Users/protected/Library")).is_err());
        assert!(profile.check_path(&root.0.join("home/../../outside")).is_err());
        assert!(profile.check_path(&root.0.with_extension("lookalike")).is_err());
        profile.check_path(&root.0.join("home/Library/Application Support/app")).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlink_roots_and_descendants_are_rejected() {
        use std::os::unix::fs::symlink;
        let root = Root::new();
        let outside = Root::new();
        symlink(&outside.0, root.0.join("link")).unwrap();
        assert!(VisualQaProfile::requested(Some(root.0.join("link").as_os_str()), true).is_err());
        fs::remove_file(root.0.join("link")).unwrap();
        let profile = root.prepare().unwrap();
        symlink(&outside.0, root.0.join("escape")).unwrap();
        assert!(profile.check_path(&root.0.join("escape/database")).is_err());
        assert_eq!(fs::read_dir(outside.0.as_path()).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn shared_root_is_rejected_before_mutation() {
        use std::os::unix::fs::PermissionsExt;
        let root = Root::new();
        fs::set_permissions(&root.0, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(root.prepare().is_err());
        assert_eq!(fs::read_dir(&root.0).unwrap().count(), 0);
    }
}
