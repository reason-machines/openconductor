//! Chats whose agent is Claude Code, run with the user's signed-in `claude`
//! CLI over stream-json ([`crate::agent::claude_session`]).
//!
//! * [`map`] - stream-json events to the chat events the UI renders for
//!   Reason (same payloads as [`crate::reason_acp::wire`]).
//! * [`runner`] - one `claude` process per chat: turns, Stop, restarts.
//! * [`commands`] - the Tauri commands and the `claude-chat-event` stream.
//!
//! The UI flow matches Reason chats: `claude_open_chat(chatId, cwd,
//! sessionId?)`, then `claude_prompt(chatId, text)` per message (resolves
//! with the turn's end), `claude_cancel(chatId)` for Stop.
//!
//! Evidence of the CLI's real output is in `evidence/claude-code/`.

pub mod commands;
pub mod map;
pub mod runner;

#[cfg(test)]
mod map_tests;
#[cfg(all(test, unix))]
mod runner_tests;

use std::ffi::OsStr;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

/// The first executable `claude` on `path_var`, then the folders the Claude
/// Code installers use (`~/.local/bin`, `~/.claude/local`), then Homebrew
/// and `/usr/local/bin`. An app opened from Finder has a bare `PATH`, so the
/// path must be found here rather than by the shell. Relative `PATH`
/// entries are skipped.
pub fn find_claude_cli(path_var: Option<&OsStr>, home: Option<&Path>) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = path_var
        .map(|p| std::env::split_paths(p).collect())
        .unwrap_or_default();
    if let Some(home) = home {
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".claude/local"));
    }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    dirs.into_iter()
        .filter(|d| d.is_absolute())
        .map(|d| d.join("claude"))
        .find(|p| {
            p.metadata()
                .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
                .unwrap_or(false)
        })
}
