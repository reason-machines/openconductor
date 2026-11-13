//! Workspace and branch naming.
//!
//! Workspace names are short lowercase slugs that double as the worktree
//! directory name. Branches preserve a custom prefix delimiter, defaulting
//! to `/` when none is set. The word list is our own.

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
    match prefix.map(|p| p.trim_start_matches('/')).filter(|p| !p.is_empty()) {
        Some(p) if p.ends_with('/') => format!("{}/{name}", p.trim_end_matches('/')),
        Some(p) if p.ends_with(['_', '.', '-']) => format!("{p}{name}"),
        Some(p) => format!("{p}/{name}"),
        None => name.to_string(),
    }
}

/// Clone folder basename. Remote names follow Conductor's sanitizer; local
/// paths retain their basename. `None` when nothing usable is left.
pub fn repo_name_from_url(url: &str) -> Option<String> {
    let input = url.trim();
    let remote = if let Some((scheme, _)) = input.split_once("://") {
        scheme != "file"
    } else {
        input.split_once(':').is_some_and(|(host, path)| {
            !host.is_empty() && !host.contains(['/', '\\'])
                && !(host.len() == 1 && host.as_bytes()[0].is_ascii_alphabetic() && path.starts_with(['/', '\\']))
        })
    };
    let trimmed = input.trim_end_matches(['/', '\\']);
    let trimmed = trimmed.strip_suffix(".git").unwrap_or(trimmed).trim_end_matches(['/', '\\']);
    let name = trimmed.rsplit(['/', '\\', ':']).next()?;
    let name = if remote {
        let sanitized: String = name.to_lowercase().chars().map(|ch| {
            if ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '-' | '_' | '.') { ch } else { '-' }
        }).collect();
        sanitized.split('-').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("-")
    } else {
        name.to_string()
    };
    (!name.is_empty() && name != "." && name != "..").then_some(name)
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
