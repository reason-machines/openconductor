//! "Open in": the workspace header's Open button and its menu.
//!
//! Conductor 0.87.6 keeps one app catalog in its frontend (`sX` in the
//! renderApp chunk, REA-extracted and read as data). Finder and Terminal are
//! always offered; every other app is offered when `/Applications/<App>.app`
//! or `~/Applications/<App>.app` exists (`Z_s`), JetBrains apps also when
//! their Toolbox folder exists, and Xcode also when `xcode-select` points into
//! an `Xcode*.app`. The menu lists the offered apps in catalog order.
//!
//! Icons: Conductor converts each installed app's `CFBundleIconFile` .icns to
//! a 128 px PNG with `sips` (`gLr`) for its app switcher and ships its own
//! copies of the icons for the menu. OpenConductor ships no third-party icons:
//! it reads the PNG the app's own .icns already holds ([`icon`]).

pub mod commands;
pub mod icon;
#[cfg(all(test, unix))]
mod deleted_finder_ipc;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod alacritty_workspace_tests;
#[cfg(test)]
mod alacritty_status_tests;
#[cfg(all(test, target_os = "macos"))]
mod kaleidoscope_tests;
#[cfg(all(test, target_os = "macos"))]
mod wezterm_folder_tests;
#[cfg(all(test, target_os = "macos"))]
mod vscode_workspace_context_ipc;

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use serde::Serialize;

/// What a catalog app is, for its fallback glyph and for how it opens a folder.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IconType {
    Folder,
    Code,
    Terminal,
}

#[derive(Debug)]
pub struct CatalogApp {
    pub id: &'static str,
    /// Menu label.
    pub display_name: &'static str,
    /// Bundle name: `/Applications/<app_name>.app`, and `open -a <app_name>`.
    pub app_name: &'static str,
    pub icon_type: IconType,
    /// Offered without looking for the bundle (Finder, Terminal).
    pub always_available: bool,
    /// JetBrains Toolbox folder under `~/Library/Application Support/JetBrains/Toolbox/apps/`.
    pub toolbox_id: Option<&'static str>,
}

const fn app(
    id: &'static str,
    display_name: &'static str,
    app_name: &'static str,
    icon_type: IconType,
) -> CatalogApp {
    CatalogApp {
        id,
        display_name,
        app_name,
        icon_type,
        always_available: false,
        toolbox_id: None,
    }
}

const fn always(id: &'static str, display_name: &'static str, icon_type: IconType) -> CatalogApp {
    CatalogApp {
        id,
        display_name,
        app_name: display_name,
        icon_type,
        always_available: true,
        toolbox_id: None,
    }
}

const fn toolbox(
    id: &'static str,
    display_name: &'static str,
    app_name: &'static str,
    toolbox_id: &'static str,
) -> CatalogApp {
    CatalogApp {
        id,
        display_name,
        app_name,
        icon_type: IconType::Code,
        always_available: false,
        toolbox_id: Some(toolbox_id),
    }
}

use IconType::{Code, Folder, Terminal};

/// Conductor's catalog, in its order (which is the menu's order).
pub const CATALOG: &[CatalogApp] = &[
    always("finder", "Finder", Folder),
    app("cursor", "Cursor", "Cursor", Code),
    app("vscode", "VS Code", "Visual Studio Code", Code),
    app("vscode-short", "VS Code", "VS Code", Code),
    app("zed", "Zed", "Zed", Code),
    app("zed-preview", "Zed Preview", "Zed Preview", Code),
    app("zed-nightly", "Zed Nightly", "Zed Nightly", Code),
    app("vscodium", "VSCodium", "VSCodium", Code),
    app("devin", "Devin Desktop", "Devin", Code),
    app("sublime", "Sublime Text", "Sublime Text", Code),
    toolbox("pycharm", "PyCharm", "PyCharm", "pycharm-professional"),
    toolbox(
        "pycharm-ce",
        "PyCharm Community",
        "PyCharm CE",
        "pycharm-community",
    ),
    toolbox("intellij", "IntelliJ IDEA", "IntelliJ IDEA", "IDEA-U"),
    toolbox(
        "intellij-ce",
        "IntelliJ IDEA CE",
        "IntelliJ IDEA CE",
        "IDEA-C",
    ),
    toolbox(
        "intellij-ultimate",
        "IntelliJ IDEA Ultimate",
        "IntelliJ IDEA Ultimate",
        "IDEA-U",
    ),
    toolbox(
        "intellij-community",
        "IntelliJ IDEA Community",
        "IntelliJ IDEA Community Edition",
        "IDEA-C",
    ),
    toolbox(
        "android-studio",
        "Android Studio",
        "Android Studio",
        "android-studio",
    ),
    app("xcode", "Xcode", "Xcode", Code),
    toolbox("rider", "Rider", "Rider", "Rider"),
    toolbox("rubymine", "RubyMine", "RubyMine", "RubyMine"),
    toolbox("webstorm", "WebStorm", "WebStorm", "WebStorm"),
    toolbox("phpstorm", "PhpStorm", "PhpStorm", "PhpStorm"),
    app("ghostty", "Ghostty", "Ghostty", Terminal),
    app("alacritty", "Alacritty", "Alacritty", Terminal),
    app("iterm", "iTerm", "iTerm", Terminal),
    app("wezterm", "WezTerm", "WezTerm", Terminal),
    app("warp", "Warp", "Warp", Terminal),
    app("hyper", "Hyper", "Hyper", Terminal),
    always("terminal", "Terminal", Terminal),
    app("github-desktop", "GitHub Desktop", "GitHub Desktop", Folder),
    app("sourcetree", "Sourcetree", "Sourcetree", Folder),
    app("fork", "Fork", "Fork", Folder),
    app("kaleidoscope", "Kaleidoscope", "Kaleidoscope", Folder),
    toolbox("goland", "GoLand", "GoLand", "GoLand"),
    toolbox("datagrip", "DataGrip", "DataGrip", "datagrip"),
    app("trae", "Trae", "Trae", Code),
    app("antigravity", "Antigravity", "Antigravity", Code),
];

pub fn find(id: &str) -> Option<&'static CatalogApp> {
    CATALOG.iter().find(|a| a.id == id)
}

/// Where apps are looked for: `/Applications` and `~/Applications`, plus
/// the answer `xcode-select --print-path` gives (only Xcode reads it).
pub struct Roots {
    pub system_applications: PathBuf,
    pub home: Option<PathBuf>,
    pub xcode_select_path: Option<String>,
}

impl Roots {
    /// The machine's real roots.
    pub fn current() -> Self {
        let xcode_select_path = if cfg!(target_os = "macos") {
            std::process::Command::new("xcode-select")
                .arg("--print-path")
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        };
        Roots {
            system_applications: PathBuf::from("/Applications"),
            home: std::env::var_os("HOME").map(PathBuf::from),
            xcode_select_path,
        }
    }

    /// `<App>.app` in `/Applications`, then in `~/Applications`, if it is a folder.
    pub fn bundle(&self, app_name: &str) -> Option<PathBuf> {
        let name = format!("{app_name}.app");
        std::iter::once(self.system_applications.join(&name))
            .chain(self.home.iter().map(|h| h.join("Applications").join(&name)))
            .find(|p| p.is_dir())
    }

    fn toolbox_installed(&self, toolbox_id: &str) -> bool {
        self.home.as_ref().is_some_and(|h| {
            h.join("Library/Application Support/JetBrains/Toolbox/apps")
                .join(toolbox_id)
                .is_dir()
        })
    }

    /// Conductor's `xcode-select --print-path | grep -q 'Xcode.*\.app'`.
    fn xcode_selected(&self) -> bool {
        self.xcode_select_path
            .as_deref()
            .is_some_and(|p| p.find("Xcode").is_some_and(|i| p[i..].contains(".app")))
    }

    pub fn available(&self, app: &CatalogApp) -> bool {
        app.always_available
            || self.bundle(app.app_name).is_some()
            || app.toolbox_id.is_some_and(|t| self.toolbox_installed(t))
            || (app.id == "xcode" && self.xcode_selected())
    }

    /// The bundle whose icon the menu shows: the installed one, else the
    /// system copy of Finder, Terminal or the selected Xcode.
    pub fn icon_bundle(&self, app: &CatalogApp) -> Option<PathBuf> {
        self.bundle(app.app_name).or_else(|| {
            let system = match app.id {
                "finder" => PathBuf::from("/System/Library/CoreServices/Finder.app"),
                "terminal" => PathBuf::from("/System/Applications/Utilities/Terminal.app"),
                "xcode" if self.xcode_selected() => {
                    let p = self.xcode_select_path.as_deref()?;
                    PathBuf::from(&p[..p.find(".app")? + 4])
                }
                _ => return None,
            };
            system.is_dir().then_some(system)
        })
    }
}

/// The apps offered on this machine, in catalog order.
pub fn available_apps(roots: &Roots) -> Vec<&'static CatalogApp> {
    CATALOG.iter().filter(|a| roots.available(a)).collect()
}

/// The program and arguments that open `dir` in `app` on macOS (Conductor's
/// `uD` for a workspace folder): Finder runs `open <dir>`, Xcode `xed <dir>`,
/// WezTerm spawns with `--cwd`, and other apps use `open -a <App> <dir>`.
pub fn macos_open_command(app: &CatalogApp, dir: &Path) -> (String, Vec<String>) {
    let dir = dir.to_string_lossy().into_owned();
    match app.id {
        "finder" => ("open".into(), vec![dir]),
        "xcode" => ("xed".into(), vec![dir]),
        "wezterm" => (
            "wezterm".into(),
            vec!["cli".into(), "spawn".into(), "--cwd".into(), dir],
        ),
        _ => ("open".into(), vec!["-a".into(), app.app_name.into(), dir]),
    }
}

/// The program and arguments that open one worktree `file` in `app` on macOS,
/// for the right panel's All files tree. OpenConductor has no in-app file
/// viewer, so a file opens through Open in: Finder reveals it (`open -R`), a
/// terminal opens its folder (handing a file to a terminal would run it), and
/// every other app opens the file itself the way it opens a workspace folder.
pub fn macos_open_file_command(app: &CatalogApp, file: &Path) -> (String, Vec<String>) {
    match app.icon_type {
        IconType::Folder => (
            "open".into(),
            vec!["-R".into(), file.to_string_lossy().into_owned()],
        ),
        IconType::Terminal => macos_open_command(app, file.parent().unwrap_or(file)),
        IconType::Code => macos_open_command(app, file),
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum AlacrittyExit {
    Success,
    Nonzero(String),
}

pub fn run_alacritty_folder(
    dir: &Path,
    mut run: impl FnMut(&str, &[String]) -> Result<AlacrittyExit, String>,
) -> Result<(), String> {
    let dir = dir.to_string_lossy().into_owned();
    match run(
        "alacritty",
        &[
            "msg".into(),
            "create-window".into(),
            "--working-directory".into(),
            dir.clone(),
        ],
    )? {
        AlacrittyExit::Success => {
            run("open", &["-a".into(), "Alacritty".into()])?;
            Ok(())
        }
        AlacrittyExit::Nonzero(_) => match run(
            "open",
            &[
                "-na".into(),
                "Alacritty".into(),
                "--args".into(),
                "--working-directory".into(),
                dir,
            ],
        )? {
            AlacrittyExit::Success => Ok(()),
            AlacrittyExit::Nonzero(error) => Err(error),
        },
    }
}

pub fn alacritty_search_path(path: Option<&OsStr>, home: Option<&OsStr>) -> Result<OsString, String> {
    let mut dirs: Vec<PathBuf> = path.into_iter().flat_map(std::env::split_paths).collect();
    dirs.push(PathBuf::from("/Applications/Alacritty.app/Contents/MacOS"));
    if let Some(home) = home {
        dirs.push(Path::new(home).join("Applications/Alacritty.app/Contents/MacOS"));
    }
    std::env::join_paths(dirs).map_err(|err| err.to_string())
}

pub fn run_macos_open(
    app: &CatalogApp,
    path: &Path,
    is_file: bool,
    mut run: impl FnMut(&str, &[String]) -> Result<(), String>,
) -> Result<(), String> {
    if app.id == "alacritty" && !is_file {
        // The legacy runner has no transport/status distinction; production uses the typed runner.
        return run_alacritty_folder(path, |program, args| {
            Ok(match run(program, args) {
                Ok(()) => AlacrittyExit::Success,
                Err(error) => AlacrittyExit::Nonzero(error),
            })
        });
    }
    let (program, args) = if is_file {
        macos_open_file_command(app, path)
    } else {
        macos_open_command(app, path)
    };
    let result = run(&program, &args);
    if app.id == "wezterm" {
        return if result.is_ok() {
            run("open", &["-a".into(), app.app_name.into()])
        } else {
            let dir = if is_file {
                path.parent().unwrap_or(path)
            } else {
                path
            };
            run(
                "open",
                &[
                    "-a".into(),
                    app.app_name.into(),
                    "--args".into(),
                    "start".into(),
                    "--cwd".into(),
                    dir.to_string_lossy().into_owned(),
                ],
            )
        };
    }
    result.or_else(|err| {
        if app.id == "xcode" {
            run(
                "open",
                &[
                    "-a".into(),
                    app.app_name.into(),
                    path.to_string_lossy().into_owned(),
                ],
            )
        } else {
            Err(err)
        }
    })
}

pub fn wezterm_search_path(path: Option<&OsStr>, home: Option<&OsStr>) -> Result<OsString, String> {
    let mut dirs: Vec<PathBuf> = path.into_iter().flat_map(std::env::split_paths).collect();
    dirs.push(PathBuf::from("/Applications/WezTerm.app/Contents/MacOS"));
    if let Some(home) = home {
        dirs.push(Path::new(home).join("Applications/WezTerm.app/Contents/MacOS"));
    }
    std::env::join_paths(dirs).map_err(|err| err.to_string())
}
