//! Workspace and branch naming.
//!
//! Workspace names are short lowercase slugs that double as the worktree
//! directory name. Branches are `<prefix>/<name>` when a prefix is set,
//! otherwise just `<name>`. The word list is our own.

use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

const WORDS: &[&str] = &[
    "alder", "aspen", "birch", "cedar", "cypress", "elm", "fir", "hazel", "hemlock", "juniper",
    "larch", "laurel", "linden", "maple", "oak", "olive", "pine", "poplar", "redwood", "rowan",
    "sequoia", "spruce", "sycamore", "willow", "yew", "acacia", "baobab", "banyan", "cork",
    "ginkgo", "hickory", "magnolia", "mahogany", "mangrove", "myrtle", "palm", "teak", "walnut",
];

/// Lowercase, ASCII alphanumerics and single dashes; trimmed of dashes.
pub fn slugify(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !out.is_empty() && !dash {
            out.push('-');
            dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out.truncate(64);
    while out.ends_with('-') {
        out.pop();
    }
    out
}

/// Join an optional branch prefix and a workspace name.
pub fn branch_for(prefix: Option<&str>, name: &str) -> String {
    match prefix.map(|p| p.trim_matches('/')).filter(|p| !p.is_empty()) {
        Some(p) => format!("{p}/{name}"),
        None => name.to_string(),
    }
}

/// Folder name `git clone` would pick for `url`: its last path segment
/// without a trailing `.git`. Handles https, `git@host:owner/name` and local
/// paths; `None` when nothing usable is left.
pub fn repo_name_from_url(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches(['/', '\\']);
    let trimmed = trimmed.strip_suffix(".git").unwrap_or(trimmed).trim_end_matches(['/', '\\']);
    let name = trimmed.rsplit(['/', '\\', ':']).next()?;
    (!name.is_empty() && name != "." && name != "..").then(|| name.to_string())
}

/// Next candidate after a taken name, as in the reference app: `x` becomes
/// `x-v1`, and `x-vN` becomes `x-v(N+1)`.
pub fn bump(name: &str) -> String {
    if let Some(i) = name.rfind("-v") {
        let (stem, digits) = (&name[..i], &name[i + 2..]);
        if !stem.is_empty() && !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) {
            if let Ok(n) = digits.parse::<u64>() {
                return format!("{stem}-v{}", n.saturating_add(1));
            }
        }
    }
    format!("{name}-v1")
}

/// Make `base` unique against `taken` by bumping it (`-v1`, `-v2`, ...).
pub fn uniquify(base: &str, taken: impl Fn(&str) -> bool) -> String {
    let mut name = base.to_string();
    while taken(&name) {
        name = bump(&name);
    }
    name
}

/// Pick an unused word from the list (seeded by time), falling back to a
/// numbered suffix once every word is used.
pub fn generate_name(taken: &HashSet<String>) -> String {
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as usize ^ d.as_secs() as usize)
        .unwrap_or(0);
    for i in 0..WORDS.len() {
        let w = WORDS[(seed + i) % WORDS.len()];
        if !taken.contains(w) {
            return w.to_string();
        }
    }
    uniquify(WORDS[seed % WORDS.len()], |c| taken.contains(c))
}
