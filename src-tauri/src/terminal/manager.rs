//! Running terminals: spawn on a PTY, forward output, accept input.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use portable_pty::{native_pty_system, ChildKiller, MasterPty, PtySize};

use super::flow::FlowGate;
use super::kill;
use super::mirror::Mirrors;
use super::screen::{ScreenSnapshot, ScreenState, DEFAULT_SCROLLBACK_LINES};
use super::scrollback::Scrollback;
use super::spawn::{
    build_command, check_size, EventSink, ExitInfo, PtyEvent, Result, SpawnRequest, TerminalError,
};

/// How long [`PtyEvent::Exit`] waits for the reader to drain after the
/// child exits. A background job that inherited the PTY can keep it open
/// forever; the exit is reported anyway and late output still arrives.
const DRAIN_GRACE: Duration = Duration::from_millis(1000);
pub(crate) const READ_CHUNK: usize = 64 * 1024;

#[derive(Default)]
struct Lifecycle {
    exit: Option<ExitInfo>,
    reader_done: bool,
}

pub(crate) struct Session {
    pub(crate) pid: Option<u32>,
    pub(crate) master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    pub(crate) killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    flow: Arc<FlowGate>,
    scrollback: Arc<Mutex<Scrollback>>,
    /// What the terminal shows, fed the same bytes as the renderer.
    screen: Arc<Mutex<ScreenState>>,
    life: Arc<(Mutex<Lifecycle>, Condvar)>,
}

impl Session {
    fn exit_info(&self) -> Option<ExitInfo> {
        self.life.0.lock().unwrap().exit.clone()
    }

    pub(crate) fn wait_exit(&self, timeout: Duration) -> Option<ExitInfo> {
        let (lock, cv) = &*self.life;
        let guard = lock.lock().unwrap();
        let (guard, _) = cv
            .wait_timeout_while(guard, timeout, |l| l.exit.is_none())
            .unwrap();
        guard.exit.clone()
    }
}

pub struct PtyManager {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    mirrors: Mirrors,
    sink: Arc<dyn EventSink>,
    next_id: AtomicU64,
}

impl PtyManager {
    pub fn new(sink: impl EventSink) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            mirrors: Mirrors::default(),
            sink: Arc::new(sink),
            next_id: AtomicU64::new(1),
        }
    }

    /// Start a terminal and return its id.
    pub fn spawn(&self, req: SpawnRequest) -> Result<String> {
        let cmd = build_command(&req)?;
        let id = self.claim_id(req.id.as_deref())?;
        let spawn_err = |e: &dyn std::fmt::Display| TerminalError::Spawn(e.to_string());

        let pair = native_pty_system()
            .openpty(PtySize {
                rows: req.rows,
                cols: req.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| spawn_err(&e))?;
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| spawn_err(&e))?;
        // Our copy of the slave must close, or the reader never sees EOF.
        drop(pair.slave);
        let reader = pair.master.try_clone_reader().map_err(|e| spawn_err(&e))?;
        let writer = pair.master.take_writer().map_err(|e| spawn_err(&e))?;
        let pid = child.process_id();

        let session = Arc::new(Session {
            pid,
            killer: Mutex::new(child.clone_killer()),
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            flow: Arc::new(FlowGate::new(req.flow)),
            scrollback: Arc::new(Mutex::new(Scrollback::new(req.scrollback_limit))),
            screen: Arc::new(Mutex::new(ScreenState::new(
                req.cols,
                req.rows,
                DEFAULT_SCROLLBACK_LINES,
            ))),
            life: Arc::new((Mutex::new(Lifecycle::default()), Condvar::new())),
        });
        {
            let mut sessions = self.sessions.lock().unwrap();
            if sessions.contains_key(&id) {
                // Lost a race with another spawn using the same id.
                let _ = child.kill();
                return Err(TerminalError::DuplicateId(id));
            }
            sessions.insert(id.clone(), session.clone());
        }
        self.sink.emit(PtyEvent::Ready {
            id: id.clone(),
            pid,
        });

        // Reader: PTY output -> scrollback + Data events, gated by acks.
        let (sink, rid, s) = (self.sink.clone(), id.clone(), session.clone());
        thread::Builder::new()
            .name(format!("pty-read-{id}"))
            .spawn(move || {
                read_loop(reader, &rid, &s, &*sink);
                let (lock, cv) = &*s.life;
                lock.lock().unwrap().reader_done = true;
                cv.notify_all();
            })?;

        // Waiter: child exit -> Exit event, after output has drained.
        let (sink, wid, life) = (self.sink.clone(), id.clone(), session.life.clone());
        thread::Builder::new()
            .name(format!("pty-wait-{id}"))
            .spawn(move || {
                let info = match child.wait() {
                    Ok(status) => ExitInfo {
                        exit_code: status.exit_code(),
                        signal: status.signal().map(str::to_owned),
                    },
                    Err(_) => ExitInfo {
                        exit_code: 1,
                        signal: None,
                    },
                };
                let (lock, cv) = &*life;
                let guard = lock.lock().unwrap();
                let (mut guard, _) = cv
                    .wait_timeout_while(guard, DRAIN_GRACE, |l| !l.reader_done)
                    .unwrap();
                guard.exit = Some(info.clone());
                cv.notify_all();
                drop(guard);
                sink.emit(PtyEvent::Exit {
                    id: wid,
                    exit_code: info.exit_code,
                    signal: info.signal,
                });
            })?;

        if let Some(command) = req.initial_command.as_deref().filter(|c| !c.is_empty()) {
            let mut line = command.as_bytes().to_vec();
            line.push(b'\r');
            self.write(&id, &line)?;
        }
        Ok(id)
    }

    fn claim_id(&self, requested: Option<&str>) -> Result<String> {
        let sessions = self.sessions.lock().unwrap();
        let id = match requested {
            Some(id) => id.to_owned(),
            None => loop {
                let n = self.next_id.fetch_add(1, Ordering::Relaxed);
                let candidate = format!("pty-{n}");
                if !sessions.contains_key(&candidate) {
                    break candidate;
                }
            },
        };
        if sessions.contains_key(&id) {
            return Err(TerminalError::DuplicateId(id));
        }
        Ok(id)
    }

    /// Send input (keystrokes, paste) to the terminal.
    pub fn write(&self, id: &str, data: &[u8]) -> Result<()> {
        let s = self.get(id)?;
        if s.exit_info().is_some() {
            return Err(TerminalError::NotRunning(id.to_owned()));
        }
        let mut w = s.writer.lock().unwrap();
        w.write_all(data)?;
        w.flush()?;
        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        check_size(cols, rows)?;
        let s = self.get(id)?;
        let master = s.master.lock().unwrap();
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| TerminalError::Io(std::io::Error::other(e.to_string())))?;
        s.screen.lock().unwrap().resize(cols, rows);
        Ok(())
    }

    /// The renderer has processed `n` more bytes of output.
    pub fn ack_bytes(&self, id: &str, n: usize) -> Result<()> {
        self.get(id)?.flow.ack(n);
        Ok(())
    }

    /// Output kept for replay, oldest first.
    pub fn history(&self, id: &str) -> Result<Vec<u8>> {
        Ok(self.get(id)?.scrollback.lock().unwrap().to_vec())
    }

    /// "Clear terminal scrollback": drop the kept history.
    pub fn clear_history(&self, id: &str) -> Result<()> {
        self.get(id)?.scrollback.lock().unwrap().clear();
        Ok(())
    }

    /// The last `max_lines` rows of a terminal's or mirror's screen
    /// (`pty_screen_text`).
    pub fn screen_text(&self, id: &str, max_lines: usize) -> Result<String> {
        Ok(self.screen(id)?.lock().unwrap().text(max_lines))
    }

    /// A restorable snapshot of a terminal's or mirror's screen
    /// (`pty_screen_snapshot`).
    pub fn screen_snapshot(&self, id: &str) -> Result<ScreenSnapshot> {
        Ok(self.screen(id)?.lock().unwrap().snapshot())
    }

    /// Feed output into a mirror, or into a terminal's screen without
    /// sending it to the program (`pty_write_mirror`).
    pub fn write_mirror(&self, id: &str, data: &[u8]) -> Result<()> {
        let screen = match self.get(id) {
            Ok(s) => s.screen.clone(),
            Err(_) => self.mirrors.get(id)?,
        };
        screen.lock().unwrap().write(data);
        Ok(())
    }

    /// Start a screen with no program behind it (`pty_create_mirror`).
    /// Creating an id that exists starts it over blank.
    pub fn create_mirror(
        &self,
        id: &str,
        cols: u16,
        rows: u16,
        max_buffered_bytes: Option<usize>,
    ) -> Result<()> {
        check_size(cols, rows)?;
        if self.sessions.lock().unwrap().contains_key(id) {
            return Err(TerminalError::DuplicateId(id.to_owned()));
        }
        self.mirrors.create(id, cols, rows, max_buffered_bytes);
        Ok(())
    }

    pub fn resize_mirror(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        check_size(cols, rows)?;
        self.mirrors.get(id)?.lock().unwrap().resize(cols, rows);
        Ok(())
    }

    pub fn delete_mirror(&self, id: &str) -> Result<()> {
        self.mirrors.delete(id)
    }

    pub fn mirror_ids(&self) -> Vec<String> {
        self.mirrors.ids()
    }

    fn screen(&self, id: &str) -> Result<Arc<Mutex<ScreenState>>> {
        match self.get(id) {
            Ok(s) => Ok(s.screen.clone()),
            Err(not_found) => self.mirrors.get(id).map_err(|_| not_found),
        }
    }

    pub fn pid(&self, id: &str) -> Result<Option<u32>> {
        Ok(self.get(id)?.pid)
    }

    /// `Some` once the process has exited.
    pub fn exit_info(&self, id: &str) -> Result<Option<ExitInfo>> {
        Ok(self.get(id)?.exit_info())
    }

    pub fn ids(&self) -> Vec<String> {
        let mut ids: Vec<_> = self.sessions.lock().unwrap().keys().cloned().collect();
        ids.sort();
        ids
    }

    /// Stop the terminal's processes and forget the terminal. The `Exit`
    /// event still arrives. Returns without waiting for the process.
    pub fn kill(&self, id: &str) -> Result<()> {
        let s = self
            .sessions
            .lock()
            .unwrap()
            .remove(id)
            .ok_or_else(|| TerminalError::NotFound(id.to_owned()))?;
        s.flow.close();
        if s.exit_info().is_none() {
            kill::stop(s)?;
        } else {
            eprintln!("DIAG kill: {id} already exited: {:?}", s.exit_info());
        }
        Ok(())
    }

    /// Kill every terminal (app shutdown).
    pub fn kill_all(&self) {
        for id in self.ids() {
            let _ = self.kill(&id);
        }
    }

    fn get(&self, id: &str) -> Result<Arc<Session>> {
        self.sessions
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| TerminalError::NotFound(id.to_owned()))
    }
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        self.kill_all();
    }
}

fn read_loop(mut reader: Box<dyn Read + Send>, id: &str, s: &Session, sink: &dyn EventSink) {
    let mut buf = vec![0u8; READ_CHUNK];
    loop {
        if !s.flow.wait_ready() {
            return;
        }
        let n = match reader.read(&mut buf) {
            Ok(0) => return,
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            // EIO once every slave fd is closed (Linux); treat as EOF.
            Err(_) => return,
        };
        let chunk = buf[..n].to_vec();
        s.scrollback.lock().unwrap().push(&chunk);
        s.screen.lock().unwrap().write(&chunk);
        s.flow.sent(n);
        sink.emit(PtyEvent::Data {
            id: id.to_owned(),
            data: chunk,
        });
    }
}
