//! "Recents" in the sidebar's add-repository menu: local git checkouts the
//! user worked in lately.
//!
//! Conductor 0.87.6 runs one zsh script on the local host for this list
//! (decoded `renderApp-D_fmY7hW.js`, `MQo` @ byte 9,779,976; query key
//! `recentLocalRepositories` `LQo` @ 9,779,933; runner `FQo` @ 9,782,837, 15 s timeout,
//! a non-zero exit gives an empty list). This is that script in Rust:
//!
//! 1. The last 2,000 lines of `~/.zsh_history` (extended format,
//!    `: <ts>:<elapsed>;<command>`). Each `cd <path>` gives its absolute path
//!    as a candidate and its basename as a bump: a discovered repository with
//!    that basename takes the newer timestamp.
//! 2. Every `.git` directory at most 3 levels below a fixed set of roots
//!    (`~/conductor/repos`, `~/Developer`, `~/code`, ...), skipping
//!    `node_modules`, `target`, `dist`, `.next`, `vendor` and `Pods`. Its
//!    timestamp is the `.git` directory's mtime. Roots are canonicalised
//!    first so case variants are scanned once.
//! 3. Each path keeps its newest timestamp; newest first (ties: path in
//!    reverse byte order, as `sort -rn` does); only paths that still hold a
//!    `.git` directory; at most 8.
//!
//! The script's text is third-party data; only its behaviour is reproduced.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Search roots, in Conductor's order, relative to `$HOME`.
pub const ROOTS: &[&str] = &[
    "conductor/repos",
    "Developer",
    "developer",
    "dev",
    "Code",
    "code",
    "Projects",
    "projects",
    "src",
    "work",
];

/// Directory names `find -prune` skips.
pub const PRUNED: &[&str] = &["node_modules", "target", "dist", ".next", "vendor", "Pods"];

/// `find -maxdepth 3`: the `.git` entry itself may be 3 levels below a root.
const MAX_DEPTH: usize = 3;
/// `tail -n 2000 ~/.zsh_history`.
const HISTORY_LINES: usize = 2000;
/// `head -n 8`.
pub const LIMIT: usize = 8;

/// What one zsh history line contributes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HistoryHit {
    /// An absolute `cd` target (the script's `P` record).
    Path { ts: i64, path: String },
    /// A `cd` target's last segment (the script's `B` record).
    Base { ts: i64, base: String },
}

/// The script's awk pass over one history line. Only extended-history lines
/// (`: <digits>:...;cd <path>`) whose last `;`-separated field starts with
/// `cd ` count.
pub fn parse_history_line(line: &str, home: &str) -> Vec<HistoryHit> {
    // awk -F';': $1 is the text before the first ';', $NF after the last.
    let first = line.split(';').next().unwrap_or("");
    let last = line.rsplit(';').next().unwrap_or("");
    // $1 ~ /^:[ ]*[0-9]+:/
    let Some(rest) = first.strip_prefix(':') else {
        return Vec::new();
    };
    let rest = rest.trim_start_matches(' ');
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() || !rest[digits.len()..].starts_with(':') {
        return Vec::new();
    }
    // $NF ~ /^cd /
    let Some(target) = last.strip_prefix("cd ") else {
        return Vec::new();
    };
    // split($1, parts, ":"); ts = parts[2] without spaces; `+ 0` later.
    let ts = first
        .split(':')
        .nth(1)
        .map(|p| p.replace(' ', ""))
        .and_then(|p| leading_number(&p))
        .unwrap_or(0);
    let mut path = match target.strip_prefix('~') {
        Some(after) => format!("{home}{after}"),
        None => target.to_string(),
    };
    while path.ends_with('/') {
        path.pop();
    }
    let mut hits = Vec::new();
    if path.starts_with('/') {
        hits.push(HistoryHit::Path {
            ts,
            path: path.clone(),
        });
    }
    let base = path.rsplit('/').next().unwrap_or("");
    if !base.is_empty() && base != ".." && base != "." {
        hits.push(HistoryHit::Base {
            ts,
            base: base.to_string(),
        });
    }
    hits
}

/// awk's string-to-number: the leading decimal digits, 0 when there are none.
fn leading_number(s: &str) -> Option<i64> {
    let digits: String = s.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// The script's final awk + `sort -rn` + `head`: merge history hits with
/// discovered repositories, keep each path's newest timestamp, and return
/// the newest `LIMIT` paths for which `is_repo` holds.
pub fn rank(
    history: &[HistoryHit],
    discovered: &[(i64, String)],
    is_repo: impl Fn(&str) -> bool,
) -> Vec<String> {
    let mut base_max: HashMap<&str, i64> = HashMap::new();
    let mut candidates: Vec<(i64, &str)> = Vec::new();
    // The script prints history records before discovered ones; order only
    // matters for which duplicate is seen first, and the max is taken anyway.
    for hit in history {
        match hit {
            HistoryHit::Base { ts, base } => {
                let e = base_max.entry(base.as_str()).or_insert(*ts);
                if *ts > *e {
                    *e = *ts;
                }
            }
            HistoryHit::Path { ts, path } => candidates.push((*ts, path.as_str())),
        }
    }
    candidates.extend(discovered.iter().map(|(ts, p)| (*ts, p.as_str())));
    let mut path_max: HashMap<&str, i64> = HashMap::new();
    for (ts, path) in candidates {
        let base = path.rsplit('/').next().unwrap_or("");
        let ts = match base_max.get(base) {
            Some(b) if *b > ts => *b,
            _ => ts,
        };
        let e = path_max.entry(path).or_insert(ts);
        if ts > *e {
            *e = ts;
        }
    }
    let mut ranked: Vec<(i64, &str)> = path_max.into_iter().map(|(p, ts)| (ts, p)).collect();
    // `sort -rn` on "ts\tpath": numeric key descending, then the whole line
    // in reverse byte order.
    ranked.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(a.1)));
    ranked
        .into_iter()
        .filter(|(_, p)| is_repo(p))
        .take(LIMIT)
        .map(|(_, p)| p.to_string())
        .collect()
}

/// `tail -n 2000 ~/.zsh_history` through the awk pass. A missing or
/// unreadable file gives nothing (the script tests `-f` first).
fn history_hits(home: &Path) -> Vec<HistoryHit> {
    let Ok(bytes) = fs::read(home.join(".zsh_history")) else {
        return Vec::new();
    };
    // LC_ALL=C: bytes, not characters. Lossy decoding keeps ASCII paths intact.
    let text = String::from_utf8_lossy(&bytes);
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(HISTORY_LINES);
    let home = home.to_string_lossy();
    lines[start..]
        .iter()
        .flat_map(|l| parse_history_line(l, &home))
        .collect()
}

/// `find <root> -maxdepth 3 \( -name <pruned> ... \) -prune -o -name .git -type d -print`,
/// then `sed 's#/.git$##'`. `find` does not follow symlinks.
fn find_git_dirs(root: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if !kind.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if PRUNED.contains(&name.as_ref()) {
            continue;
        }
        if name == ".git" {
            out.push(root.to_path_buf());
            // find also descends into .git, where no further `.git` directory lives.
            continue;
        }
        if depth < MAX_DEPTH {
            find_git_dirs(&entry.path(), depth + 1, out);
        }
    }
}

/// The `.git` directory's mtime in seconds (`stat -f %m`).
fn git_mtime(repo: &Path) -> Option<i64> {
    let meta = fs::metadata(repo.join(".git")).ok()?;
    if !meta.is_dir() {
        return None;
    }
    let secs = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs();
    i64::try_from(secs).ok()
}

/// Repositories found under the roots, each with its `.git` mtime.
fn discover(home: &Path) -> Vec<(i64, String)> {
    let mut seen_roots = HashSet::new();
    let mut repos = Vec::new();
    for root in ROOTS {
        // [ -d "$root" ] && canon=$(cd "$root" && pwd -P)
        let Ok(canon) = fs::canonicalize(home.join(root)) else {
            continue;
        };
        if !canon.is_dir() || !seen_roots.insert(canon.clone()) {
            continue;
        }
        find_git_dirs(&canon, 1, &mut repos);
    }
    let mut seen = HashSet::new();
    repos
        .into_iter()
        .filter(|p| seen.insert(p.clone()))
        .filter_map(|p| git_mtime(&p).map(|ts| (ts, p.to_string_lossy().into_owned())))
        .collect()
}

/// The whole list for `home`, newest first.
pub fn recent_local_repos(home: &Path) -> Vec<String> {
    let history = history_hits(home);
    let discovered = discover(home);
    rank(&history, &discovered, |p| {
        Path::new(p).join(".git").is_dir()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOME: &str = "/Users/me";

    #[test]
    fn extended_history_cd_gives_path_and_basename() {
        assert_eq!(
            parse_history_line(": 1700000000:0;cd ~/code/app/", HOME),
            vec![
                HistoryHit::Path {
                    ts: 1700000000,
                    path: "/Users/me/code/app".into()
                },
                HistoryHit::Base {
                    ts: 1700000000,
                    base: "app".into()
                },
            ]
        );
    }

    #[test]
    fn relative_cd_gives_only_a_basename() {
        assert_eq!(
            parse_history_line(": 5:0;cd projects/api", HOME),
            vec![HistoryHit::Base {
                ts: 5,
                base: "api".into()
            }]
        );
        assert!(parse_history_line(": 5:0;cd ..", HOME).is_empty());
    }

    #[test]
    fn only_the_last_command_of_a_line_counts() {
        assert!(parse_history_line(": 5:0;cd /a; ls", HOME).is_empty());
        assert!(parse_history_line(": 5:0;ls;cd /b", HOME)
            .iter()
            .any(|h| matches!(h, HistoryHit::Path { path, .. } if path == "/b")));
    }

    #[test]
    fn plain_history_lines_are_ignored() {
        assert!(parse_history_line("cd /tmp", HOME).is_empty());
        assert!(parse_history_line(": x:0;cd /tmp", HOME).is_empty());
        assert!(parse_history_line(": 1:0;git status", HOME).is_empty());
    }

    #[test]
    fn basename_bump_and_newest_first() {
        let history = vec![
            HistoryHit::Base {
                ts: 50,
                base: "old".into(),
            },
            HistoryHit::Path {
                ts: 40,
                path: "/h/x/cdonly".into(),
            },
        ];
        let discovered = vec![
            (10, "/h/code/old".to_string()),
            (30, "/h/code/new".to_string()),
            (20, "/h/code/gone".to_string()),
        ];
        let got = rank(&history, &discovered, |p| p != "/h/code/gone");
        assert_eq!(got, vec!["/h/code/old", "/h/x/cdonly", "/h/code/new"]);
    }

    #[test]
    fn ties_sort_in_reverse_path_order_and_cap_at_eight() {
        let discovered: Vec<(i64, String)> = (0..10).map(|i| (7, format!("/r/{i}"))).collect();
        let got = rank(&[], &discovered, |_| true);
        assert_eq!(got.len(), LIMIT);
        assert_eq!(got[0], "/r/9");
        assert_eq!(got[7], "/r/2");
    }

    #[test]
    fn scans_roots_and_skips_pruned_and_deep_repos() {
        let home = std::env::temp_dir().join(format!("recent-repos-{}", std::process::id()));
        let _ = fs::remove_dir_all(&home);
        for dir in [
            "code/a/.git",
            "code/group/b/.git",
            "code/group/deeper/c/.git",
            "code/node_modules/d/.git",
            "elsewhere/e/.git",
        ] {
            fs::create_dir_all(home.join(dir)).unwrap();
        }
        fs::write(
            home.join(".zsh_history"),
            format!(": 9999999999:0;cd {}/elsewhere/e\n", home.display()),
        )
        .unwrap();
        let got = recent_local_repos(&home);
        let rel: HashSet<String> = got
            .iter()
            .map(|p| {
                Path::new(p)
                    .strip_prefix(fs::canonicalize(&home).unwrap())
                    .or_else(|_| Path::new(p).strip_prefix(&home))
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(
            rel,
            ["code/a", "code/group/b", "elsewhere/e"]
                .map(String::from)
                .into_iter()
                .collect()
        );
        // The history entry has the newest timestamp.
        assert!(got[0].ends_with("elsewhere/e"));
        fs::remove_dir_all(&home).unwrap();
    }
}
