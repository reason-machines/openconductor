// parity:diff.file-render:backend
//! Path handling for git diff headers: C-style quoting and `a/` `b/` sides.

/// Split `a/<old> b/<new>` from a `diff --git` header. Quoted paths are
/// unambiguous; unquoted ones may contain spaces, so when both sides are the
/// same path the header is split in the middle.
pub fn split_git_header(rest: &str) -> (String, String) {
    if rest.starts_with('"') {
        if let Some(end) = closing_quote(rest) {
            let old = unquote(&rest[..=end]);
            let new = unquote(rest[end + 1..].trim_start());
            return (strip_side(&old, "a/"), strip_side(&new, "b/"));
        }
    }
    if rest.len() % 2 == 1 {
        let mid = rest.len() / 2;
        let (old, new) = (&rest[..mid], &rest[mid + 1..]);
        if rest.is_char_boundary(mid) && old.get(2..) == new.get(2..) {
            return (strip_side(old, "a/"), strip_side(new, "b/"));
        }
    }
    match rest.split_once(" b/") {
        Some((old, new)) => (strip_side(old, "a/"), new.to_string()),
        None => (rest.to_string(), rest.to_string()),
    }
}

fn closing_quote(s: &str) -> Option<usize> {
    let mut escaped = false;
    for (i, c) in s.char_indices().skip(1) {
        match (escaped, c) {
            (true, _) => escaped = false,
            (false, '\\') => escaped = true,
            (false, '"') => return Some(i),
            _ => {}
        }
    }
    None
}

pub fn strip_side(path: &str, prefix: &str) -> String {
    path.strip_prefix(prefix).unwrap_or(path).to_string()
}

/// Undo git's C-style path quoting (`"dir/\303\244 \"x\".txt"`).
pub fn unquote(s: &str) -> String {
    let Some(inner) = s.strip_prefix('"').and_then(|t| t.strip_suffix('"')) else {
        return s.to_string();
    };
    let mut bytes = Vec::with_capacity(inner.len());
    let mut it = inner.bytes().peekable();
    while let Some(b) = it.next() {
        if b != b'\\' {
            bytes.push(b);
            continue;
        }
        match it.next() {
            Some(b'n') => bytes.push(b'\n'),
            Some(b't') => bytes.push(b'\t'),
            Some(b'r') => bytes.push(b'\r'),
            Some(b'a') => bytes.push(0x07),
            Some(b'b') => bytes.push(0x08),
            Some(b'f') => bytes.push(0x0c),
            Some(b'v') => bytes.push(0x0b),
            Some(d @ b'0'..=b'7') => {
                let mut v = u32::from(d - b'0');
                for _ in 0..2 {
                    match it.peek() {
                        Some(&n @ b'0'..=b'7') => {
                            v = v * 8 + u32::from(n - b'0');
                            it.next();
                        }
                        _ => break,
                    }
                }
                bytes.push(v as u8);
            }
            Some(other) => bytes.push(other),
            None => bytes.push(b'\\'),
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unquotes_escapes_and_octal_utf8() {
        assert_eq!(unquote(r#""caf\303\251 \"x\".txt""#), "caf\u{e9} \"x\".txt");
        assert_eq!(unquote(r#""tab\there\\""#), "tab\there\\");
        assert_eq!(unquote("plain name.txt"), "plain name.txt");
    }

    #[test]
    fn splits_headers_with_spaces_and_renames() {
        assert_eq!(
            split_git_header("a/my file.rs b/my file.rs"),
            ("my file.rs".to_string(), "my file.rs".to_string())
        );
        assert_eq!(
            split_git_header("a/old.rs b/new.rs"),
            ("old.rs".to_string(), "new.rs".to_string())
        );
        assert_eq!(
            split_git_header(r#""a/sp\303\244ce x" "b/sp\303\244ce x""#),
            ("sp\u{e4}ce x".to_string(), "sp\u{e4}ce x".to_string())
        );
    }

    #[test]
    fn strip_side_only_strips_its_prefix() {
        assert_eq!(strip_side("a/x", "a/"), "x");
        assert_eq!(strip_side("b/x", "a/"), "b/x");
    }
}
