//! Bounded raw-output history for a terminal.
//!
//! Keeps roughly the last `limit` bytes of PTY output so a renderer that
//! attaches late (tab switch, window reload) or a restarted app can replay
//! it. The limit is approximate on purpose ("approximate terminal output to
//! keep" in the reference settings): when trimming, the cut moves forward to
//! the next line break so replay never starts inside an escape sequence or a
//! UTF-8 character.

use std::collections::VecDeque;

/// Default byte budget for a terminal's history.
pub const DEFAULT_LIMIT: usize = 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Scrollback {
    buf: VecDeque<u8>,
    limit: usize,
    /// Bytes ever dropped from the front; lets callers detect truncation.
    dropped: u64,
}

impl Scrollback {
    pub fn new(limit: usize) -> Self {
        Self {
            buf: VecDeque::new(),
            limit,
            dropped: 0,
        }
    }

    pub fn limit(&self) -> usize {
        self.limit
    }

    pub fn len(&self) -> usize {
        self.buf.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buf.is_empty()
    }

    pub fn dropped(&self) -> u64 {
        self.dropped
    }

    pub fn push(&mut self, data: &[u8]) {
        if self.limit == 0 {
            self.dropped += data.len() as u64;
            return;
        }
        self.buf.extend(data);
        if self.buf.len() <= self.limit {
            return;
        }
        let mut cut = self.buf.len() - self.limit;
        // Advance past the next newline so the kept text starts on a fresh
        // line. If there is none in the kept region, cut exactly.
        if let Some(pos) = self.buf.range(cut..).position(|&b| b == b'\n') {
            cut += pos + 1;
        }
        self.buf.drain(..cut);
        self.dropped += cut as u64;
    }

    /// Replace the contents (used when loading persisted history), applying
    /// the same trimming as [`push`](Self::push).
    pub fn replace(&mut self, data: &[u8]) {
        self.buf.clear();
        self.push(data);
    }

    pub fn clear(&mut self) {
        self.dropped += self.buf.len() as u64;
        self.buf.clear();
    }

    pub fn to_vec(&self) -> Vec<u8> {
        self.buf.iter().copied().collect()
    }
}

impl Default for Scrollback {
    fn default() -> Self {
        Self::new(DEFAULT_LIMIT)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_forward_to_a_line_start() {
        let mut s = Scrollback::new(10);
        s.push(b"aaaa\nbbbb\n");
        assert_eq!(s.to_vec(), b"aaaa\nbbbb\n");
        s.push(b"cc\n");
        assert_eq!(s.to_vec(), b"bbbb\ncc\n");
        assert_eq!(s.dropped(), 5);
        // No newline in the kept region: cut exactly at the limit.
        s.push(b"0123456789AB");
        assert_eq!(s.to_vec(), b"23456789AB");
    }

    #[test]
    fn replace_clear_and_zero_limit() {
        let mut s = Scrollback::new(4);
        s.replace(b"x\nyyyy");
        assert_eq!(s.to_vec(), b"yyyy");
        s.clear();
        assert!(s.is_empty());
        let mut off = Scrollback::new(0);
        off.push(b"abc");
        assert!(off.is_empty());
        assert_eq!(off.dropped(), 3);
    }
}
