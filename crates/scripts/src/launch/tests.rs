use super::*;

fn spec(dir: &Path, script: &str) -> LaunchSpec {
    LaunchSpec {
        script: script.into(),
        script_path: script_path(
            &dir.join(".conductor"),
            &dir.join("ws"),
            ScriptKind::Run,
            "t1",
        ),
        cwd: dir.to_path_buf(),
        base_env: BTreeMap::from([("PATH".to_string(), "/usr/bin:/bin".to_string())]),
        overlay: BTreeMap::from([("CONDUCTOR_PORT".to_string(), "55000".to_string())]),
        lang: Some("en_US.UTF-8".into()),
    }
}

#[test]
fn script_path_slugs_the_workspace_path() {
    let p = script_path(
        Path::new("/h/.conductor"),
        Path::new("/w/app/tokyo"),
        ScriptKind::Setup,
        "abc",
    );
    assert_eq!(
        p,
        PathBuf::from("/h/.conductor/projects/--w--app--tokyo/setup-abc.sh")
    );
}

#[test]
fn runs_in_cwd_with_env_and_merges_output() {
    let tmp = tempfile::tempdir().unwrap();
    let s = spec(
        tmp.path(),
        "echo out; echo err >&2; echo \"$CONDUCTOR_PORT $TERM $(pwd)\"; exit 3",
    );
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink_seen = seen.clone();
    let sink: OutputSink = Arc::new(move |b: &[u8]| sink_seen.lock().unwrap().extend_from_slice(b));
    let mut p = spawn(&s, Some(sink)).unwrap();
    let exit = p.wait().unwrap();
    assert_eq!(
        exit,
        Exit {
            code: Some(3),
            signal: None
        }
    );
    let text = p.transcript.text();
    // `pwd` reports the logical $PWD we set (macOS temp dirs sit behind /var -> /private/var).
    let cwd = tmp.path();
    assert!(text.contains("out\n") && text.contains("err\n"), "{text}");
    assert!(
        text.contains(&format!("55000 xterm-256color {}", cwd.display())),
        "{text}"
    );
    assert_eq!(
        seen.lock().unwrap().as_slice(),
        p.transcript.bytes().as_slice()
    );
    assert!(!s.script_path.exists(), "script file is removed after exit");
}

#[test]
fn stop_terminates_the_whole_process_group() {
    let tmp = tempfile::tempdir().unwrap();
    let marker = tmp.path().join("child.pid");
    let script = format!(
        "sleep 30 & echo $! > {}; echo started; wait",
        marker.display()
    );
    let mut p = spawn(&spec(tmp.path(), &script), None).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !p.transcript.text().contains("started") {
        assert!(Instant::now() < deadline, "script did not start");
        thread::sleep(Duration::from_millis(20));
    }
    let child: i32 = fs::read_to_string(&marker).unwrap().trim().parse().unwrap();
    let exit = p.stop(Duration::from_secs(2)).unwrap();
    assert!(!exit.success());
    thread::sleep(Duration::from_millis(100));
    // SAFETY: signal 0 only checks whether the pid still exists.
    let alive = unsafe { libc::kill(child, 0) } == 0;
    assert!(!alive, "background child {child} survived stop");
}

#[test]
fn stop_escalates_to_sigkill() {
    let tmp = tempfile::tempdir().unwrap();
    let mut p = spawn(
        &spec(
            tmp.path(),
            "trap '' TERM; echo ready; while :; do sleep 0.1; done",
        ),
        None,
    )
    .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !p.transcript.text().contains("ready") {
        assert!(Instant::now() < deadline, "script did not start");
        thread::sleep(Duration::from_millis(20));
    }
    let exit = p.stop(Duration::from_millis(300)).unwrap();
    assert_eq!(exit.signal, Some(libc::SIGKILL));
}

#[test]
fn spawn_error_removes_the_script_file() {
    let tmp = tempfile::tempdir().unwrap();
    let mut s = spec(tmp.path(), "true");
    s.cwd = tmp.path().join("missing");
    assert!(spawn(&s, None).is_err());
    assert!(!s.script_path.exists());
}
