use std::fs;
use std::path::{Path, PathBuf};

use super::commands::list;
use super::icon::{icns_path, icns_pngs, pick_png};
use super::*;

fn temp_dir() -> PathBuf {
    let d = std::env::temp_dir().join(format!("oc-open-in-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&d).unwrap();
    d
}

fn roots(base: &Path) -> Roots {
    Roots {
        system_applications: base.join("Applications"),
        home: Some(base.join("home")),
        xcode_select_path: None,
    }
}

/// A PNG header claiming `width` x `width`; enough for the icns reader.
fn png(width: u32) -> Vec<u8> {
    let mut p = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
    p.extend(width.to_be_bytes());
    p.extend(width.to_be_bytes());
    p.extend([8, 6, 0, 0, 0]);
    p
}

fn icns(entries: &[(&[u8; 4], Vec<u8>)]) -> Vec<u8> {
    let mut body = Vec::new();
    for (kind, data) in entries {
        body.extend(*kind);
        body.extend(((data.len() + 8) as u32).to_be_bytes());
        body.extend(data);
    }
    let mut out = b"icns".to_vec();
    out.extend(((body.len() + 8) as u32).to_be_bytes());
    out.extend(body);
    out
}

/// `<dir>/<name>.app` with an Info.plist naming `icon_file` and that .icns.
fn bundle(dir: &Path, name: &str, icon_file: &str, icns_bytes: Option<Vec<u8>>) -> PathBuf {
    let b = dir.join(format!("{name}.app"));
    fs::create_dir_all(b.join("Contents/Resources")).unwrap();
    let mut info = plist::Dictionary::new();
    info.insert(
        "CFBundleIconFile".into(),
        plist::Value::String(icon_file.into()),
    );
    plist::Value::Dictionary(info)
        .to_file_xml(b.join("Contents/Info.plist"))
        .unwrap();
    if let Some(bytes) = icns_bytes {
        let file = if icon_file.ends_with(".icns") {
            icon_file.to_string()
        } else {
            format!("{icon_file}.icns")
        };
        fs::write(b.join("Contents/Resources").join(file), bytes).unwrap();
    }
    b
}

fn ids(roots: &Roots) -> Vec<&'static str> {
    available_apps(roots).into_iter().map(|a| a.id).collect()
}

#[test]
fn finder_and_terminal_are_always_offered() {
    let base = temp_dir();
    assert_eq!(ids(&roots(&base)), ["finder", "terminal"]);
}

#[test]
fn installed_apps_join_in_catalog_order() {
    let base = temp_dir();
    let system = base.join("Applications");
    let user = base.join("home/Applications");
    // Sven's Mac: Cursor, VS Code, Zed, Xcode and Ghostty, one of them in ~/Applications.
    for name in ["Ghostty", "Visual Studio Code", "Xcode", "Cursor"] {
        fs::create_dir_all(system.join(format!("{name}.app"))).unwrap();
    }
    fs::create_dir_all(user.join("Zed.app")).unwrap();
    // A file named like a bundle is not an app.
    fs::write(system.join("Warp.app"), b"").unwrap();
    assert_eq!(
        ids(&roots(&base)),
        ["finder", "cursor", "vscode", "zed", "xcode", "ghostty", "terminal"]
    );
}

#[test]
fn jetbrains_toolbox_and_xcode_select_count_as_installed() {
    let base = temp_dir();
    fs::create_dir_all(base.join("home/Library/Application Support/JetBrains/Toolbox/apps/IDEA-U"))
        .unwrap();
    let mut r = roots(&base);
    r.xcode_select_path = Some("/Applications/Xcode-beta.app/Contents/Developer".into());
    assert_eq!(
        ids(&r),
        [
            "finder",
            "intellij",
            "intellij-ultimate",
            "xcode",
            "terminal"
        ]
    );
    r.xcode_select_path = Some("/Library/Developer/CommandLineTools".into());
    assert_eq!(
        ids(&r),
        ["finder", "intellij", "intellij-ultimate", "terminal"]
    );
}

#[test]
fn icon_is_the_smallest_png_at_least_64_wide() {
    let file = icns(&[
        (b"ic10", png(1024)),
        (b"ic04", vec![1, 2, 3]),
        (b"ic07", png(128)),
        (b"ic11", png(64)),
        (b"icp4", png(16)),
    ]);
    let widths: Vec<u32> = icns_pngs(&file).iter().map(|(w, _)| *w).collect();
    assert_eq!(widths, [1024, 128, 64, 16]);
    assert_eq!(pick_png(&file), Some(png(64).as_slice()));
    // Only small images: the largest.
    assert_eq!(
        pick_png(&icns(&[(b"icp4", png(16)), (b"icp5", png(32))])),
        Some(png(32).as_slice())
    );
    // No PNG entries, a truncated file, not an icns file.
    assert_eq!(pick_png(&icns(&[(b"ic04", vec![0; 20])])), None);
    assert_eq!(pick_png(&file[..30]), None);
    assert_eq!(pick_png(b"not an icns file"), None);
}

#[test]
fn icon_file_is_named_with_or_without_extension() {
    let base = temp_dir();
    let with = bundle(
        &base,
        "Cursor",
        "Cursor.icns",
        Some(icns(&[(b"ic07", png(128))])),
    );
    let without = bundle(
        &base,
        "Ghostty",
        "Ghostty",
        Some(icns(&[(b"ic07", png(128))])),
    );
    let missing = bundle(&base, "Broken", "Broken", None);
    assert_eq!(
        icns_path(&with),
        Some(with.join("Contents/Resources/Cursor.icns"))
    );
    assert_eq!(
        icns_path(&without),
        Some(without.join("Contents/Resources/Ghostty.icns"))
    );
    assert_eq!(icns_path(&missing), None);
}

#[test]
fn list_carries_each_installed_apps_icon() {
    let base = temp_dir();
    bundle(
        &base.join("Applications"),
        "Zed",
        "Zed.icns",
        Some(icns(&[(b"ic09", png(512))])),
    );
    bundle(&base.join("Applications"), "Cursor", "Cursor", None);
    let apps = list(&roots(&base));
    let rows: Vec<(&str, &str, IconType, bool)> = apps
        .iter()
        .map(|a| (a.id, a.name, a.icon_type, a.icon.is_some()))
        .collect();
    // Finder and Terminal have no bundle here (no /System on the test root), so they use their glyphs.
    let finder_icon = cfg!(target_os = "macos");
    assert_eq!(
        rows,
        [
            ("finder", "Finder", IconType::Folder, finder_icon),
            ("cursor", "Cursor", IconType::Code, false),
            ("zed", "Zed", IconType::Code, true),
            ("terminal", "Terminal", IconType::Terminal, finder_icon),
        ]
    );
    let zed = apps[2].icon.as_deref().unwrap();
    assert!(
        zed.starts_with("data:image/png;base64,iVBORw0KGgo"),
        "{zed}"
    );
}

#[test]
fn macos_commands_match_conductor() {
    let dir = Path::new("/Users/me/conductor/workspaces/app/lisbon");
    let cmd = |id| macos_open_command(find(id).unwrap(), dir);
    let d = dir.to_string_lossy().into_owned();
    assert_eq!(cmd("finder"), ("open".into(), vec![d.clone()]));
    assert_eq!(cmd("xcode"), ("xed".into(), vec![d.clone()]));
    assert_eq!(
        cmd("vscode"),
        (
            "open".into(),
            vec!["-a".into(), "Visual Studio Code".into(), d.clone()]
        )
    );
    assert_eq!(
        cmd("ghostty"),
        ("open".into(), vec!["-a".into(), "Ghostty".into(), d])
    );
}

#[test]
fn catalog_ids_are_unique() {
    let mut ids: Vec<_> = CATALOG.iter().map(|a| a.id).collect();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), CATALOG.len());
}
