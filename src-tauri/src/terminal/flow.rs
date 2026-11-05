//! Byte-ack flow control between the PTY reader and the renderer.
//!
//! The reader adds every chunk it forwards to `unacked`; the renderer acks
//! bytes once it has drawn them (`pty_ack_bytes`). While `unacked` is at or
//! above the high watermark the reader stops reading, so a runaway producer
//! (`yes`, a huge `cat`) blocks in the kernel instead of flooding the UI. It
//! resumes once acks bring `unacked` down to the low watermark. Closing the
//! gate (kill, shutdown) releases a waiting reader for good.

use std::sync::{Condvar, Mutex};
use std::time::Duration;

/// Watermarks in bytes. `low` must not exceed `high`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FlowLimits {
    pub high: usize,
    pub low: usize,
}

impl Default for FlowLimits {
    fn default() -> Self {
        Self {
            high: 512 * 1024,
            low: 128 * 1024,
        }
    }
}

impl FlowLimits {
    pub fn new(high: usize, low: usize) -> Self {
        let high = high.max(1);
        Self {
            high,
            low: low.min(high),
        }
    }
}

#[derive(Debug, Default)]
struct State {
    unacked: usize,
    paused: bool,
    closed: bool,
}

#[derive(Debug)]
pub struct FlowGate {
    limits: FlowLimits,
    state: Mutex<State>,
    changed: Condvar,
}

impl FlowGate {
    pub fn new(limits: FlowLimits) -> Self {
        Self {
            limits,
            state: Mutex::new(State::default()),
            changed: Condvar::new(),
        }
    }

    /// Record bytes handed to the renderer.
    pub fn sent(&self, n: usize) {
        let mut s = self.state.lock().unwrap();
        s.unacked = s.unacked.saturating_add(n);
        if s.unacked >= self.limits.high {
            s.paused = true;
        }
    }

    /// Record bytes the renderer has processed. Acking more than was sent
    /// clamps to zero rather than building credit.
    pub fn ack(&self, n: usize) {
        let mut s = self.state.lock().unwrap();
        s.unacked = s.unacked.saturating_sub(n);
        if s.paused && s.unacked <= self.limits.low {
            s.paused = false;
            self.changed.notify_all();
        }
    }

    /// Block while paused. Returns `false` once the gate is closed.
    pub fn wait_ready(&self) -> bool {
        let mut s = self.state.lock().unwrap();
        while s.paused && !s.closed {
            s = self.changed.wait(s).unwrap();
        }
        !s.closed
    }

    /// Like [`wait_ready`](Self::wait_ready) with a timeout; `None` on timeout.
    pub fn wait_ready_timeout(&self, timeout: Duration) -> Option<bool> {
        let s = self.state.lock().unwrap();
        let (s, res) = self
            .changed
            .wait_timeout_while(s, timeout, |s| s.paused && !s.closed)
            .unwrap();
        if res.timed_out() {
            None
        } else {
            Some(!s.closed)
        }
    }

    pub fn close(&self) {
        let mut s = self.state.lock().unwrap();
        s.closed = true;
        self.changed.notify_all();
    }

    pub fn unacked(&self) -> usize {
        self.state.lock().unwrap().unacked
    }

    pub fn is_paused(&self) -> bool {
        self.state.lock().unwrap().paused
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pauses_at_high_and_resumes_at_low() {
        let g = FlowGate::new(FlowLimits::new(100, 20));
        g.sent(99);
        assert!(!g.is_paused());
        g.sent(1);
        assert!(g.is_paused());
        assert_eq!(g.wait_ready_timeout(Duration::from_millis(20)), None);
        g.ack(50); // 50 left: still above low
        assert!(g.is_paused());
        g.ack(30); // 20 left: resume
        assert!(!g.is_paused());
        assert_eq!(g.wait_ready_timeout(Duration::from_millis(20)), Some(true));
    }

    #[test]
    fn over_acking_clamps_and_close_releases_waiters() {
        let g = std::sync::Arc::new(FlowGate::new(FlowLimits::new(10, 5)));
        g.ack(1000);
        assert_eq!(g.unacked(), 0);
        g.sent(10);
        let waiter = {
            let g = g.clone();
            std::thread::spawn(move || g.wait_ready())
        };
        std::thread::sleep(Duration::from_millis(20));
        g.close();
        assert!(!waiter.join().unwrap());
        assert_eq!(FlowLimits::new(10, 50), FlowLimits { high: 10, low: 10 });
        assert_eq!(FlowLimits::new(0, 0).high, 1);
    }
}
