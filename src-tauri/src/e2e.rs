//! In-app end-to-end seam for macOS, where tauri-driver (WebDriver) does not
//! run and a locked screen rules out UI automation.
//!
//! Debug builds only. When the app starts with `OC_E2E_SCRIPT=<file.js>`,
//! that script is evaluated in the main window once it has loaded; it drives
//! the real UI (clicks, typing) and reports with `e2e_report`, which writes
//! `$OC_E2E_OUT/<name>.json`. With `OC_E2E_OUT` set, agent chat events are
//! also appended to `$OC_E2E_OUT/<agent>-chat-events.jsonl` (Claude Code,
//! Codex, Reason); `OC_E2E_SIZE=<w>x<h>` sets the window size. Without these
//! variables, and in release builds, nothing here does anything.
//! Driver: `tools/claude-code/e2e-driver.js`.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};

/// Set by the first `e2e_report`: the driver runs, so it is not evaluated again.
static REPORTED: AtomicBool = AtomicBool::new(false);

fn out_dir() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var_os("OC_E2E_OUT").map(PathBuf::from)
}

/// Evaluates `$OC_E2E_SCRIPT` in the main window after it loads.
pub fn install<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if !cfg!(debug_assertions) {
        return;
    }
    let Some(path) = std::env::var_os("OC_E2E_SCRIPT") else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        use tauri::Manager;
        let script = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => return eprintln!("e2e: cannot read {}: {e}", PathBuf::from(&path).display()),
        };
        // The script waits for the UI itself; this only waits for the window.
        // An eval can land before the page is ready and be lost, so it is
        // repeated until the driver's first report (drivers guard against
        // running twice with `window.__OC_E2E_RUNNING__`).
        for _ in 0..100 {
            if let Some(w) = app.get_webview_window("main") {
                // OC_E2E_SIZE=1440x900 sizes the window for comparable captures.
                if let Some((wd, ht)) = std::env::var("OC_E2E_SIZE").ok().and_then(|s| {
                    let (a, b) = s.split_once('x')?;
                    Some((a.parse::<f64>().ok()?, b.parse::<f64>().ok()?))
                }) {
                    let _ = w.set_size(tauri::LogicalSize::new(wd, ht));
                }
                std::thread::sleep(std::time::Duration::from_secs(2));
                for _ in 0..30 {
                    if let Err(e) = w.eval(&script) {
                        eprintln!("e2e: eval failed: {e}");
                    }
                    for _ in 0..50 {
                        if REPORTED.load(Ordering::SeqCst) {
                            // A hidden window (locked screen) suspends the page's
                            // timers; a DOM change every 250 ms wakes the driver's
                            // waits, which also resolve on mutations.
                            loop {
                                let _ = w.eval("document.body && (document.body.dataset.ocE2eTick = String(Date.now()))");
                                std::thread::sleep(std::time::Duration::from_millis(250));
                            }
                        }
                        std::thread::sleep(std::time::Duration::from_millis(200));
                    }
                }
                return eprintln!("e2e: the driver never reported");
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        eprintln!("e2e: no main window");
    });
}

/// Appends one chat event to `$OC_E2E_OUT/<agent>-chat-events.jsonl`.
pub fn log_event(agent: &str, event: &Value) {
    let Some(dir) = out_dir() else { return };
    let path = dir.join(format!("{agent}-chat-events.jsonl"));
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{event}");
    }
}

/// Writes the driver's report `data` to `$OC_E2E_OUT/<name>.json`. `name` is
/// lowercase letters, digits and `-`.
#[tauri::command]
pub fn e2e_report(name: String, data: Value) -> Result<String, String> {
    let dir = out_dir().ok_or("e2e reports need a debug build started with OC_E2E_OUT")?;
    REPORTED.store(true, Ordering::SeqCst);
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(format!("bad report name {name:?}"));
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{name}.json"));
    let text = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}
