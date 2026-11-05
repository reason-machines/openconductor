use super::*;
use std::sync::atomic::AtomicUsize;
use std::sync::mpsc;

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "oc-agent-binaries-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn sha(data: &[u8]) -> String {
    hex(&Sha256::digest(data))
}

fn expected(exe: &str, data: &[u8]) -> ExpectedFile {
    ExpectedFile {
        exe: exe.into(),
        sha256: sha(data),
        size: Some(data.len() as u64),
    }
}

fn install(store: &AgentBinaries, name: &str, version: &str, exe: &str, data: &[u8]) -> Meta {
    store
        .download_from_reader(
            name,
            version,
            &expected(exe, data),
            &mut &data[..],
            &CancelToken::new(),
            &mut |_| {},
        )
        .unwrap()
}

/// Files left in a directory tree (relative paths), sorted.
fn tree(dir: &Path) -> Vec<String> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<String>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for e in entries {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk(base, &p, out);
            } else {
                out.push(p.strip_prefix(base).unwrap().display().to_string());
            }
        }
    }
    let mut out = Vec::new();
    walk(dir, dir, &mut out);
    out.sort();
    out
}

#[cfg(unix)]
fn mode(path: &Path) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path).unwrap().permissions().mode() & 0o777
}

// ---------------------------------------------------------------------------
// Layout and meta format

#[test]
fn layout_matches_conductor() {
    let store = AgentBinaries::new(Path::new("/data/com.conductor.app"));
    assert_eq!(
        store.root(),
        Path::new("/data/com.conductor.app/agent-binaries")
    );
    assert_eq!(
        store.binary_path("claude", "2.1.284", "claude").unwrap(),
        Path::new("/data/com.conductor.app/agent-binaries/claude/2.1.284/claude")
    );
    assert_eq!(
        store.meta_path("claude", "2.1.284", "claude").unwrap(),
        Path::new("/data/com.conductor.app/agent-binaries/.meta/claude-2.1.284.json")
    );
    assert_eq!(
        store.meta_path("codex", "0.156.1", "codex").unwrap(),
        Path::new("/data/com.conductor.app/agent-binaries/.meta/codex-0.156.1.json")
    );
    assert_eq!(
        store
            .meta_path("codex", "0.156.1", "codex-code-mode-host")
            .unwrap(),
        Path::new(
            "/data/com.conductor.app/agent-binaries/.meta/codex-0.156.1-codex-code-mode-host.json"
        )
    );
}

#[test]
fn unsafe_components_are_rejected() {
    let store = AgentBinaries::new(Path::new("/data"));
    for bad in ["..", ".", "", "a/b", "/abs", "a\\b"] {
        assert!(
            matches!(store.version_dir("claude", bad), Err(Error::UnsafePath(_))),
            "{bad:?}"
        );
        assert!(
            store.binary_path("claude", "1.0.0", bad).is_err(),
            "{bad:?}"
        );
        assert!(store.meta_path(bad, "1.0.0", "claude").is_err(), "{bad:?}");
    }
}

#[test]
fn reads_a_meta_file_written_by_conductor() {
    // evidence: throwaway-home .meta/claude-2.1.284.json, byte for byte
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    let conductor = r#"{"sha256":"50a14c2f50f56668380fdda490167f1d3630d5cc18fb8aed3073c2c7ea7314fe","size":226563088,"downloaded_at_unix_ms":1793872377681,"verified_mtime_unix_ms":1793872376515}"#;
    fs::create_dir_all(store.meta_dir()).unwrap();
    fs::write(
        store.meta_path("claude", "2.1.284", "claude").unwrap(),
        conductor,
    )
    .unwrap();
    let meta = store
        .read_meta("claude", "2.1.284", "claude")
        .unwrap()
        .unwrap();
    assert_eq!(
        meta,
        Meta {
            sha256: "50a14c2f50f56668380fdda490167f1d3630d5cc18fb8aed3073c2c7ea7314fe".into(),
            size: 226563088,
            downloaded_at_unix_ms: 1793872377681,
            verified_mtime_unix_ms: 1793872376515,
        }
    );
    // And we write the same bytes back (field order, no whitespace).
    store
        .write_meta("claude", "2.1.284", "claude", &meta)
        .unwrap();
    assert_eq!(
        fs::read_to_string(store.meta_path("claude", "2.1.284", "claude").unwrap()).unwrap(),
        conductor
    );
}

#[test]
fn absent_and_corrupt_meta() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    assert_eq!(store.read_meta("claude", "1.0.0", "claude").unwrap(), None);
    fs::create_dir_all(store.meta_dir()).unwrap();
    for corrupt in [
        "",
        "{",
        "[]",
        r#"{"sha256":"ab","size":"big"}"#,
        r#"{"sha256":"ab"}"#,
    ] {
        fs::write(
            store.meta_path("claude", "1.0.0", "claude").unwrap(),
            corrupt,
        )
        .unwrap();
        assert!(
            matches!(
                store.read_meta("claude", "1.0.0", "claude"),
                Err(Error::CorruptMeta { .. })
            ),
            "{corrupt:?}"
        );
    }
}

// ---------------------------------------------------------------------------
// Download and verify

#[test]
fn download_installs_binary_and_meta() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    let data = b"#!/bin/sh\necho claude\n".repeat(1000);
    let before = unix_ms(SystemTime::now());
    let mut seen = Vec::new();
    let meta = store
        .download_from_reader(
            "claude",
            "2.1.284",
            &expected("claude", &data),
            &mut &data[..],
            &CancelToken::new(),
            &mut |n| seen.push(n),
        )
        .unwrap();
    let binary = store.binary_path("claude", "2.1.284", "claude").unwrap();
    assert_eq!(fs::read(&binary).unwrap(), data);
    assert_eq!(meta.sha256, sha(&data));
    assert_eq!(meta.size, data.len() as u64);
    assert!(meta.downloaded_at_unix_ms >= before);
    // verified_mtime is the installed file's mtime, as in Conductor's capture.
    assert_eq!(meta.verified_mtime_unix_ms, mtime_ms(&binary).unwrap());
    assert_eq!(
        store.read_meta("claude", "2.1.284", "claude").unwrap(),
        Some(meta)
    );
    assert_eq!(seen.last().copied(), Some(data.len() as u64));
    assert!(seen.windows(2).all(|w| w[0] < w[1]));
    // Nothing but the binary and its meta.
    assert_eq!(
        tree(store.root()),
        [".meta/claude-2.1.284.json", "claude/2.1.284/claude"]
    );
    #[cfg(unix)]
    {
        assert_eq!(mode(&binary), 0o755);
        assert_eq!(
            mode(store.version_dir("claude", "2.1.284").unwrap().as_path()),
            0o700
        );
        assert_eq!(mode(store.root()), 0o700);
        assert_eq!(mode(&store.meta_dir()), 0o700);
        assert_eq!(
            mode(&store.meta_path("claude", "2.1.284", "claude").unwrap()),
            0o600
        );
    }
    assert_eq!(
        store.verify("claude", "2.1.284", "claude").unwrap(),
        Verification::Valid { rehashed: false }
    );
}

#[test]
fn verify_rehashes_when_mtime_moves_and_records_it() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    let data = b"codex binary".to_vec();
    install(&store, "codex", "0.156.1", "codex", &data);
    let binary = store.binary_path("codex", "0.156.1", "codex").unwrap();
    let later = SystemTime::now() + Duration::from_secs(3600);
    File::options()
        .write(true)
        .open(&binary)
        .unwrap()
        .set_modified(later)
        .unwrap();
    assert_eq!(
        store.verify("codex", "0.156.1", "codex").unwrap(),
        Verification::Valid { rehashed: true }
    );
    let meta = store
        .read_meta("codex", "0.156.1", "codex")
        .unwrap()
        .unwrap();
    assert_eq!(meta.verified_mtime_unix_ms, unix_ms(later));
    // Now the short-circuit applies again.
    assert_eq!(
        store.verify("codex", "0.156.1", "codex").unwrap(),
        Verification::Valid { rehashed: false }
    );
}

#[test]
fn verify_detects_tampering_missing_and_corrupt_meta() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    assert_eq!(
        store.verify("claude", "1.0.0", "claude").unwrap(),
        Verification::MissingBinary
    );
    let data = b"original bytes".to_vec();
    install(&store, "claude", "1.0.0", "claude", &data);
    let binary = store.binary_path("claude", "1.0.0", "claude").unwrap();

    // Same size, different content, new mtime: re-hash catches it.
    fs::write(&binary, b"tampered bytes").unwrap();
    File::options()
        .write(true)
        .open(&binary)
        .unwrap()
        .set_modified(SystemTime::now() + Duration::from_secs(60))
        .unwrap();
    assert_eq!(
        store.verify("claude", "1.0.0", "claude").unwrap(),
        Verification::HashMismatch {
            expected: sha(&data),
            actual: sha(b"tampered bytes"),
        }
    );
    // A mismatch does not move verified_mtime.
    let meta = store
        .read_meta("claude", "1.0.0", "claude")
        .unwrap()
        .unwrap();
    assert_ne!(meta.verified_mtime_unix_ms, mtime_ms(&binary).unwrap());

    // Different size: caught without hashing.
    fs::write(&binary, b"short").unwrap();
    assert_eq!(
        store.verify("claude", "1.0.0", "claude").unwrap(),
        Verification::SizeMismatch {
            expected: data.len() as u64,
            actual: 5,
        }
    );

    // Corrupt meta.
    let meta_path = store.meta_path("claude", "1.0.0", "claude").unwrap();
    fs::write(&meta_path, b"{not json").unwrap();
    assert!(matches!(
        store.verify("claude", "1.0.0", "claude").unwrap(),
        Verification::CorruptMeta(_)
    ));

    // No meta.
    fs::remove_file(&meta_path).unwrap();
    assert_eq!(
        store.verify("claude", "1.0.0", "claude").unwrap(),
        Verification::MissingMeta
    );
}

#[test]
fn sha_mismatch_leaves_nothing_installed() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    let data = b"payload".to_vec();
    let mut wrong = expected("claude", &data);
    wrong.sha256 = sha(b"something else");
    let err = store
        .download_from_reader(
            "claude",
            "1.0.0",
            &wrong,
            &mut &data[..],
            &CancelToken::new(),
            &mut |_| {},
        )
        .unwrap_err();
    assert!(
        matches!(&err, Error::HashMismatch { expected, actual } if *expected == sha(b"something else") && *actual == sha(&data)),
        "{err}"
    );
    assert_eq!(tree(store.root()), Vec::<String>::new());
}

#[test]
fn sha_mismatch_keeps_the_previous_good_binary() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    let good = b"good".to_vec();
    let meta = install(&store, "claude", "1.0.0", "claude", &good);
    let bad = b"evil".to_vec();
    let mut spec = expected("claude", &bad);
    spec.sha256 = sha(&good);
    assert!(store
        .download_from_reader(
            "claude",
            "1.0.0",
            &spec,
            &mut &bad[..],
            &CancelToken::new(),
            &mut |_| {}
        )
        .is_err());
    let binary = store.binary_path("claude", "1.0.0", "claude").unwrap();
    assert_eq!(fs::read(&binary).unwrap(), good);
    assert_eq!(
        store.read_meta("claude", "1.0.0", "claude").unwrap(),
        Some(meta)
    );
    assert!(store
        .verify("claude", "1.0.0", "claude")
        .unwrap()
        .is_valid());
}

#[test]
fn size_mismatch_is_rejected_both_ways() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    let data = b"0123456789".to_vec();
    for size in [5u64, 20] {
        let spec = ExpectedFile {
            size: Some(size),
            ..expected("claude", &data)
        };
        let err = store
            .download_from_reader(
                "claude",
                "1.0.0",
                &spec,
                &mut &data[..],
                &CancelToken::new(),
                &mut |_| {},
            )
            .unwrap_err();
        assert!(
            matches!(err, Error::SizeMismatch { expected, .. } if expected == size),
            "{err}"
        );
        assert_eq!(tree(store.root()), Vec::<String>::new());
    }
}

/// Yields `chunk` forever-ish, cancelling `token` after `cancel_after` reads.
struct CancellingReader {
    token: CancelToken,
    reads: usize,
    cancel_after: usize,
}

impl Read for CancellingReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.reads += 1;
        if self.reads == self.cancel_after {
            self.token.cancel();
        }
        let n = buf.len().min(1024);
        buf[..n].fill(b'x');
        Ok(n)
    }
}

#[test]
fn cancellation_stops_the_download_and_cleans_up() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    let token = CancelToken::new();
    let mut reader = CancellingReader {
        token: token.clone(),
        reads: 0,
        cancel_after: 3,
    };
    let spec = ExpectedFile {
        exe: "claude".into(),
        sha256: "00".repeat(32),
        size: None,
    };
    let mut progress = Vec::new();
    let err = store
        .download_from_reader("claude", "1.0.0", &spec, &mut reader, &token, &mut |n| {
            progress.push(n)
        })
        .unwrap_err();
    assert!(matches!(err, Error::Cancelled), "{err}");
    assert_eq!(
        reader.reads, 3,
        "stops at the first chunk boundary after cancel"
    );
    assert_eq!(progress, [1024, 2048, 3072]);
    assert_eq!(tree(store.root()), Vec::<String>::new());
}

#[test]
fn cancelled_before_start_writes_nothing() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    let token = CancelToken::new();
    token.cancel();
    let data = b"x".to_vec();
    let err = store
        .download_from_reader(
            "claude",
            "1.0.0",
            &expected("claude", &data),
            &mut &data[..],
            &token,
            &mut |_| {},
        )
        .unwrap_err();
    assert!(matches!(err, Error::Cancelled));
    assert!(store.verify("claude", "1.0.0", "claude").unwrap() == Verification::MissingBinary);
}

#[test]
fn list_versions_orders_numerically_and_flags_verification() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    assert_eq!(store.list_versions(Agent::Claude).unwrap(), []);
    install(&store, "claude", "2.1.99", "claude", b"old");
    install(&store, "claude", "2.1.284", "claude", b"new");
    install(&store, "claude", "2.0.0", "claude", b"oldest");
    // 2.1.284 broken: newest verified falls back to 2.1.99.
    fs::write(
        store.binary_path("claude", "2.1.284", "claude").unwrap(),
        b"NEW",
    )
    .unwrap();
    File::options()
        .write(true)
        .open(store.binary_path("claude", "2.1.284", "claude").unwrap())
        .unwrap()
        .set_modified(SystemTime::now() + Duration::from_secs(5))
        .unwrap();
    // Stray entries are ignored.
    fs::write(store.root().join("claude/README"), b"").unwrap();
    fs::create_dir_all(store.root().join("claude/.partial")).unwrap();
    let versions = store.list_versions(Agent::Claude).unwrap();
    assert_eq!(
        versions,
        [
            InstalledVersion {
                version: "2.0.0".into(),
                verified: true
            },
            InstalledVersion {
                version: "2.1.99".into(),
                verified: true
            },
            InstalledVersion {
                version: "2.1.284".into(),
                verified: false
            },
        ]
    );
    assert_eq!(
        store.latest_verified(Agent::Claude).unwrap().as_deref(),
        Some("2.1.99")
    );
    store.remove_version(Agent::Claude, "2.1.99").unwrap();
    store.remove_version(Agent::Claude, "9.9.9").unwrap();
    assert!(store
        .read_meta("claude", "2.1.99", "claude")
        .unwrap()
        .is_none());
    assert_eq!(
        store.latest_verified(Agent::Claude).unwrap().as_deref(),
        Some("2.0.0")
    );
}

#[test]
fn codex_release_needs_both_executables() {
    let tmp = TempDir::new();
    let store = AgentBinaries::new(&tmp.0);
    install(&store, "codex", "0.156.1", "codex", b"codex");
    assert!(!store.verify_release(Agent::Codex, "0.156.1").unwrap());
    install(&store, "codex", "0.156.1", "codex-code-mode-host", b"host");
    assert!(store.verify_release(Agent::Codex, "0.156.1").unwrap());
    assert_eq!(
        tree(store.root()),
        [
            ".meta/codex-0.156.1-codex-code-mode-host.json",
            ".meta/codex-0.156.1.json",
            "codex/0.156.1/codex",
            "codex/0.156.1/codex-code-mode-host",
        ]
    );
}

#[test]
fn version_compare() {
    use std::cmp::Ordering::*;
    assert_eq!(compare_versions("2.1.284", "2.1.99"), Greater);
    assert_eq!(compare_versions("0.156.1", "0.156.1"), Equal);
    assert_eq!(compare_versions("1.0", "1.0.1"), Less);
    assert_eq!(compare_versions("1.0.0-beta", "1.0.0-alpha"), Greater);
}

// ---------------------------------------------------------------------------
// Manager

/// A fixture "server": release files on disk, served through `file://` URLs.
struct Fixture {
    _tmp: TempDir,
    app_data: PathBuf,
    mirror: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let tmp = TempDir::new();
        let app_data = tmp.0.join("app");
        let mirror = tmp.0.join("mirror");
        fs::create_dir_all(&app_data).unwrap();
        fs::create_dir_all(&mirror).unwrap();
        Self {
            _tmp: tmp,
            app_data,
            mirror,
        }
    }

    fn file(&self, exe: &str, data: &[u8]) -> ReleaseFile {
        let path = self.mirror.join(format!("{exe}-{}", sha(data)));
        fs::write(&path, data).unwrap();
        ReleaseFile {
            exe: exe.into(),
            url: format!("file://{}", path.display()),
            sha256: sha(data),
            size: Some(data.len() as u64),
        }
    }
}

type Events = Arc<Mutex<Vec<AgentBinaryStatus>>>;

fn manager(fx: &Fixture, manifest: Manifest, fetch: Arc<dyn Fetch>) -> (BinaryManager, Events) {
    let events: Events = Arc::default();
    let sink = events.clone();
    let m = BinaryManager::new(
        AgentBinaries::new(&fx.app_data),
        fetch,
        Arc::new(StaticReleases(manifest)),
        RetryPolicy {
            max_attempts: 3,
            base_delay: Duration::from_millis(1),
        },
        Arc::new(move |s: &AgentBinaryStatus| sink.lock().unwrap().push(s.clone())),
    );
    (m, events)
}

fn states(events: &Events) -> Vec<BinaryState> {
    let mut out: Vec<BinaryState> = Vec::new();
    for e in events.lock().unwrap().iter() {
        if out.last() != Some(&e.state) {
            out.push(e.state);
        }
    }
    out
}

#[test]
fn manager_downloads_both_agents_from_fixture() {
    let fx = Fixture::new();
    let claude = vec![7u8; 3 * PROGRESS_STEP as usize + 10];
    let manifest = Manifest::from([
        (
            Agent::Claude,
            Release {
                version: "2.1.284".into(),
                files: vec![fx.file("claude", &claude)],
            },
        ),
        (
            Agent::Codex,
            Release {
                version: "0.156.1".into(),
                files: vec![
                    fx.file("codex", b"codex main"),
                    fx.file("codex-code-mode-host", b"codex host"),
                ],
            },
        ),
    ]);
    let (m, events) = manager(&fx, manifest, Arc::new(LocalFetch));
    assert_eq!(m.state(), []);

    let status = m.run_download(Agent::Claude, &CancelToken::new());
    assert_eq!(status.state, BinaryState::Ready);
    assert_eq!(status.version, "2.1.284");
    assert_eq!(
        states(&events),
        [
            BinaryState::Started,
            BinaryState::Downloading,
            BinaryState::Ready
        ]
    );
    let progress: Vec<u64> = events
        .lock()
        .unwrap()
        .iter()
        .filter(|e| e.state == BinaryState::Downloading)
        .map(|e| e.bytes_downloaded)
        .collect();
    assert_eq!(
        progress,
        [0, PROGRESS_STEP, 2 * PROGRESS_STEP, 3 * PROGRESS_STEP]
    );
    assert!(events
        .lock()
        .unwrap()
        .iter()
        .filter(|e| e.state == BinaryState::Downloading)
        .all(|e| e.bytes_total == Some(claude.len() as u64)));

    let handle = m.request_download(Agent::Codex).unwrap();
    assert_eq!(handle.join().unwrap().state, BinaryState::Ready);
    assert!(m.store().verify_release(Agent::Codex, "0.156.1").unwrap());

    let state = m.state();
    assert_eq!(state.len(), 2);
    assert!(state.iter().all(|s| s.state == BinaryState::Ready));
    assert_eq!(
        m.ready_path(Agent::Claude).unwrap(),
        fx.app_data.join("agent-binaries/claude/2.1.284/claude")
    );

    // A second request finds it verified and does not re-download.
    events.lock().unwrap().clear();
    assert_eq!(
        m.run_download(Agent::Claude, &CancelToken::new()).state,
        BinaryState::Ready
    );
    assert_eq!(states(&events), [BinaryState::Ready]);
}

#[test]
fn manager_retries_then_fails_on_sha_mismatch() {
    let fx = Fixture::new();
    let mut file = fx.file("claude", b"served bytes");
    file.sha256 = sha(b"expected bytes");
    let manifest = Manifest::from([(
        Agent::Claude,
        Release {
            version: "1.0.0".into(),
            files: vec![file],
        },
    )]);
    let (m, events) = manager(&fx, manifest, Arc::new(LocalFetch));
    let status = m.run_download(Agent::Claude, &CancelToken::new());
    assert_eq!(status.state, BinaryState::Failed);
    assert_eq!(status.attempt, Some(3));
    assert!(status.error.as_deref().unwrap().contains("sha256 mismatch"));
    let retries: Vec<_> = events
        .lock()
        .unwrap()
        .iter()
        .filter(|e| e.state == BinaryState::Retrying)
        .cloned()
        .collect();
    assert_eq!(
        retries.iter().map(|e| e.attempt).collect::<Vec<_>>(),
        [Some(2), Some(3)]
    );
    assert!(retries.iter().all(|e| e.next_attempt_unix_ms.is_some()));
    assert_eq!(tree(m.store().root()), Vec::<String>::new());
    assert_eq!(m.state(), [status]);
}

#[test]
fn manager_reports_missing_release_and_unknown_url() {
    let fx = Fixture::new();
    let manifest = Manifest::from([(
        Agent::Codex,
        Release {
            version: "1.0.0".into(),
            files: vec![ReleaseFile {
                exe: "codex".into(),
                url: "ftp://nowhere/codex".into(),
                sha256: "00".repeat(32),
                size: None,
            }],
        },
    )]);
    let (m, _) = manager(&fx, manifest, Arc::new(LocalFetch));
    let claude = m.run_download(Agent::Claude, &CancelToken::new());
    assert_eq!(claude.state, BinaryState::Failed);
    assert!(claude.error.unwrap().contains("No claude release"));
    let codex = m.run_download(Agent::Codex, &CancelToken::new());
    assert_eq!(codex.state, BinaryState::Failed);
    assert!(codex
        .error
        .unwrap()
        .contains("Unsupported agent binary URL"));
}

/// Serves bytes from memory but blocks after the first chunk until released.
struct GatedFetch {
    data: Vec<u8>,
    gate: Mutex<Option<mpsc::Receiver<()>>>,
}

struct GatedReader {
    data: Vec<u8>,
    pos: usize,
    gate: Option<mpsc::Receiver<()>>,
}

impl Read for GatedReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.pos > 0 {
            if let Some(gate) = self.gate.take() {
                let _ = gate.recv();
            }
        }
        let n = buf.len().min(4096).min(self.data.len() - self.pos);
        buf[..n].copy_from_slice(&self.data[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

impl Fetch for GatedFetch {
    fn open(&self, _url: &str) -> std::result::Result<(Box<dyn Read + Send>, Option<u64>), String> {
        Ok((
            Box::new(GatedReader {
                data: self.data.clone(),
                pos: 0,
                gate: self.gate.lock().unwrap().take(),
            }),
            Some(self.data.len() as u64),
        ))
    }
}

#[test]
fn manager_cancels_an_inflight_download() {
    let fx = Fixture::new();
    let data = vec![1u8; 64 * 1024];
    let (release_gate, gate) = mpsc::channel();
    let fetch = Arc::new(GatedFetch {
        data: data.clone(),
        gate: Mutex::new(Some(gate)),
    });
    let manifest = Manifest::from([(
        Agent::Claude,
        Release {
            version: "1.0.0".into(),
            files: vec![ReleaseFile {
                exe: "claude".into(),
                url: "gated://claude".into(),
                sha256: sha(&data),
                size: Some(data.len() as u64),
            }],
        },
    )]);
    let (m, events) = manager(&fx, manifest, fetch);
    assert!(!m.cancel(Agent::Claude), "nothing in flight yet");
    let handle = m.request_download(Agent::Claude).unwrap();
    // Wait until it is downloading, then cancel and let the reader go on.
    while !events
        .lock()
        .unwrap()
        .iter()
        .any(|e| e.state == BinaryState::Downloading)
    {
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(m.request_download(Agent::Claude).is_none(), "deduplicated");
    assert!(m.cancel(Agent::Claude));
    release_gate.send(()).unwrap();
    let status = handle.join().unwrap();
    assert_eq!(status.state, BinaryState::Failed);
    assert_eq!(status.error.as_deref(), Some("download cancelled"));
    assert!(
        !states(&events).contains(&BinaryState::Retrying),
        "no retry after cancel"
    );
    assert_eq!(tree(m.store().root()), Vec::<String>::new());
    assert!(!m.cancel(Agent::Claude), "no longer in flight");
}

#[test]
fn state_is_hydrated_from_disk() {
    let fx = Fixture::new();
    let store = AgentBinaries::new(&fx.app_data);
    install(&store, "claude", "2.1.284", "claude", b"claude");
    let (m, events) = manager(&fx, Manifest::new(), Arc::new(LocalFetch));
    assert_eq!(
        m.state(),
        [AgentBinaryStatus::new(
            Agent::Claude,
            BinaryState::Ready,
            "2.1.284"
        )]
    );
    assert!(events.lock().unwrap().is_empty(), "hydration emits nothing");
}

#[test]
fn status_json_matches_the_frontend_shape() {
    let mut s = AgentBinaryStatus::new(Agent::Codex, BinaryState::Retrying, "0.156.1");
    s.bytes_total = Some(10);
    s.attempt = Some(2);
    s.next_attempt_unix_ms = Some(5);
    s.error = Some("boom".into());
    assert_eq!(
        serde_json::to_string(&s).unwrap(),
        r#"{"agent":"codex","kind":"current","state":"retrying","version":"0.156.1","bytesDownloaded":0,"bytesTotal":10,"error":"boom","nextAttemptUnixMs":5,"attempt":2}"#
    );
    let ready = AgentBinaryStatus::new(Agent::Claude, BinaryState::Ready, "1");
    assert_eq!(
        serde_json::to_string(&ready).unwrap(),
        r#"{"agent":"claude","kind":"current","state":"ready","version":"1","bytesDownloaded":0}"#
    );
}

#[test]
fn manifest_json() {
    let json = br#"{"claude":{"version":"2.1.284","files":[{"exe":"claude","url":"file:///m/claude","sha256":"ab"}]}}"#;
    let releases = StaticReleases::from_json(json).unwrap();
    let r = releases.current(Agent::Claude).unwrap();
    assert_eq!(r.version, "2.1.284");
    assert_eq!(r.files[0].size, None);
    assert!(releases.current(Agent::Codex).is_err());
    assert!(StaticReleases::from_json(br#"{"cursor":{}}"#).is_err());
}

#[test]
fn agents() {
    assert_eq!(Agent::parse("claude"), Ok(Agent::Claude));
    assert_eq!(Agent::parse("codex"), Ok(Agent::Codex));
    assert!(Agent::parse("opencode").is_err());
}
