//! Port blocks for local workspaces.
//!
//! Each (repository, workspace) gets ten ports, `CONDUCTOR_PORT` through
//! `CONDUCTOR_PORT + 9`. Like the reference app the allocation lives in
//! memory: the first block starts at [`FIRST_PORT`], each new one
//! [`BLOCK_SIZE`] higher, and asking again returns the same block.

use std::collections::HashMap;
use std::sync::Mutex;

/// Ports per workspace.
pub const BLOCK_SIZE: u16 = 10;
/// First port of the first block.
pub const FIRST_PORT: u16 = 55000;

#[derive(Debug)]
pub struct PortAllocator {
    inner: Mutex<Inner>,
}

#[derive(Debug)]
struct Inner {
    blocks: HashMap<(String, String), u16>,
    next: u16,
}

impl Default for PortAllocator {
    fn default() -> Self {
        Self::starting_at(FIRST_PORT)
    }
}

impl PortAllocator {
    pub fn starting_at(first: u16) -> Self {
        Self {
            inner: Mutex::new(Inner {
                blocks: HashMap::new(),
                next: first,
            }),
        }
    }

    /// First port of the workspace's block, allocating one on first use.
    /// `None` once the 16-bit port space is used up.
    pub fn ports_for(&self, repo_id: &str, workspace_id: &str) -> Option<u16> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let key = (repo_id.to_string(), workspace_id.to_string());
        if let Some(&port) = inner.blocks.get(&key) {
            return Some(port);
        }
        let port = inner.next;
        port.checked_add(BLOCK_SIZE - 1)?;
        inner.next = port.saturating_add(BLOCK_SIZE);
        inner.blocks.insert(key, port);
        Some(port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_are_ten_apart_and_stable() {
        let a = PortAllocator::default();
        assert_eq!(a.ports_for("r", "w1"), Some(55000));
        assert_eq!(a.ports_for("r", "w2"), Some(55010));
        assert_eq!(a.ports_for("r", "w1"), Some(55000));
        assert_eq!(a.ports_for("other", "w1"), Some(55020));
    }

    #[test]
    fn refuses_a_block_past_the_port_space() {
        let a = PortAllocator::starting_at(65520);
        assert_eq!(a.ports_for("r", "w1"), Some(65520));
        assert_eq!(a.ports_for("r", "w2"), None);
    }
}
