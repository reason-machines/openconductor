// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    openconductor_lib::visual_qa_profile::reject_tool_entry();
    // `openconductor --tool <name> ...` runs a bundled tool (Resources/bin shims) and exits.
    if let Some(code) = openconductor_lib::tool_cli::dispatch(std::env::args_os()) {
        std::process::exit(code);
    }
    openconductor_lib::run()
}
