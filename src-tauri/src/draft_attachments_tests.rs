use super::*;
use std::fs::File;
use std::sync::atomic::{AtomicUsize, Ordering};

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "oc-draft-attachments-{}-{}",
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

fn set_mtime(path: &Path, time: SystemTime) {
    File::open(path).unwrap().set_modified(time).unwrap();
}

const DAY: Duration = Duration::from_secs(24 * 60 * 60);

#[test]
fn root_is_app_data_draft_attachments() {
    let store = DraftAttachments::new(Path::new("/data/com.conductor.app"));
    assert_eq!(
        store.root(),
        Path::new("/data/com.conductor.app/draft-attachments")
    );
    assert_eq!(
        store.staging_directory("ws-1").unwrap(),
        Path::new("/data/com.conductor.app/draft-attachments/ws-1")
    );
}

#[test]
fn resolve_strips_the_attachments_prefix() {
    let store = DraftAttachments::new(Path::new("/data"));
    assert_eq!(
        store
            .resolve("ws-1", ".context/attachments/abc123/shot.png")
            .unwrap(),
        Path::new("/data/draft-attachments/ws-1/abc123/shot.png")
    );
}

#[test]
fn resolve_rejects_paths_outside_the_attachments_dir_with_conductors_message() {
    let store = DraftAttachments::new(Path::new("/data"));
    for bad in [
        "notes/a.txt",
        ".context/attachments",
        ".context/attachmentsX/a",
        "/abs/.context/attachments/a",
    ] {
        let err = store.resolve("ws-1", bad).unwrap_err();
        assert_eq!(
            err.to_string(),
            format!(
                "Staged attachment relativePath must start with \".context/attachments/\": {bad}"
            )
        );
    }
}

#[test]
fn resolve_rejects_escapes() {
    let store = DraftAttachments::new(Path::new("/data"));
    for bad in [
        ".context/attachments/../../etc/passwd",
        ".context/attachments/",
        ".context/attachments//abs",
    ] {
        assert!(
            matches!(store.resolve("ws-1", bad), Err(Error::UnsafePath(_))),
            "{bad}"
        );
    }
    for bad_id in ["", "..", ".", "a/b", "/abs"] {
        assert!(
            matches!(store.staging_directory(bad_id), Err(Error::UnsafePath(_))),
            "{bad_id:?}"
        );
    }
}

#[test]
fn write_creates_parents_and_remove_is_idempotent() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0);
    let rel = ".context/attachments/k1/note.txt";
    let stored = store.write("ws-1", rel, b"hello").unwrap();
    assert_eq!(stored, tmp.0.join("draft-attachments/ws-1/k1/note.txt"));
    assert_eq!(fs::read(&stored).unwrap(), b"hello");

    // Overwrites in place.
    store.write("ws-1", rel, b"bye").unwrap();
    assert_eq!(fs::read(&stored).unwrap(), b"bye");

    assert!(store.remove("ws-1", rel).unwrap());
    assert!(!stored.exists());
    assert!(
        !store.remove("ws-1", rel).unwrap(),
        "absent file is a no-op"
    );
}

#[test]
fn materialize_copies_into_the_workspace_and_removes_staging() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0.join("appdata"));
    let workspace = tmp.0.join("workspace");
    fs::create_dir_all(&workspace).unwrap();
    store
        .write("ws-1", ".context/attachments/a1/one.png", b"\x89PNG")
        .unwrap();
    store
        .write("ws-1", ".context/attachments/b2/two.txt", b"two")
        .unwrap();
    // Only <dir>/<file> is considered: a loose file and a nested dir are ignored.
    let staging = store.staging_directory("ws-1").unwrap();
    fs::write(staging.join("loose.txt"), b"x").unwrap();
    fs::create_dir_all(staging.join("a1/nested")).unwrap();

    let report = store.materialize_all("ws-1", &workspace).unwrap();
    assert_eq!(
        report,
        MaterializeReport {
            attachments: vec![
                Materialized {
                    relative_path: ".context/attachments/a1/one.png".into(),
                    error: None
                },
                Materialized {
                    relative_path: ".context/attachments/b2/two.txt".into(),
                    error: None
                },
            ],
            staging_removed: true,
        }
    );
    assert_eq!(
        fs::read(workspace.join(".context/attachments/a1/one.png")).unwrap(),
        b"\x89PNG"
    );
    assert_eq!(
        fs::read(workspace.join(".context/attachments/b2/two.txt")).unwrap(),
        b"two"
    );
    assert!(!staging.exists());
    assert!(!workspace.join(".context/attachments/loose.txt").exists());
}

#[test]
fn materialize_without_staging_is_a_no_op() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0);
    assert_eq!(
        store.materialize_all("ws-none", &tmp.0).unwrap(),
        MaterializeReport::default()
    );
}

#[test]
fn materialize_keeps_staging_when_a_copy_fails() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0.join("appdata"));
    let workspace = tmp.0.join("workspace");
    fs::create_dir_all(workspace.join(".context")).unwrap();
    store
        .write("ws-1", ".context/attachments/a1/one.txt", b"1")
        .unwrap();
    store
        .write("ws-1", ".context/attachments/b2/two.txt", b"2")
        .unwrap();
    // A file where the b2 directory must go makes that copy fail.
    fs::create_dir_all(workspace.join(".context/attachments")).unwrap();
    fs::write(workspace.join(".context/attachments/b2"), b"blocker").unwrap();

    let report = store.materialize_all("ws-1", &workspace).unwrap();
    assert!(!report.staging_removed);
    assert_eq!(report.attachments.len(), 2);
    assert!(report.attachments[0].error.is_none());
    assert!(report.attachments[1].error.is_some());
    assert!(store
        .staging_directory("ws-1")
        .unwrap()
        .join("b2/two.txt")
        .exists());
}

#[test]
fn upload_one_materializes_and_removes_the_staged_copy() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0.join("appdata"));
    let workspace = tmp.0.join("workspace");
    let rel = ".context/attachments/c3/doc.pdf";
    let stored = store.write("ws-1", rel, b"%PDF").unwrap();
    let destination = store.upload_to_workspace("ws-1", rel, &workspace).unwrap();
    assert_eq!(destination, workspace.join(rel));
    assert_eq!(fs::read(&destination).unwrap(), b"%PDF");
    assert!(!stored.exists());
    // The staging dir itself stays (Conductor removes only the file).
    assert!(store.staging_directory("ws-1").unwrap().join("c3").is_dir());
}

#[test]
fn upload_of_a_missing_staged_file_fails() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0);
    assert!(store
        .upload_to_workspace("ws-1", ".context/attachments/x/y.txt", &tmp.0.join("w"))
        .is_err());
}

#[test]
fn materialize_local_path_attachment_creates_parents_and_overwrites() {
    let tmp = TempDir::new();
    let source = tmp.0.join("src.bin");
    fs::write(&source, b"abc").unwrap();
    let destination = tmp.0.join("deep/er/dest.bin");
    materialize_local_path_attachment(&source, &destination).unwrap();
    assert_eq!(fs::read(&destination).unwrap(), b"abc");
    fs::write(&source, b"xyz").unwrap();
    materialize_local_path_attachment(&source, &destination).unwrap();
    assert_eq!(fs::read(&destination).unwrap(), b"xyz");
    assert!(materialize_local_path_attachment(&tmp.0.join("missing"), &destination).is_err());
    assert!(
        materialize_local_path_attachment(&tmp.0, &tmp.0.join("dir-copy")).is_err(),
        "directories are not attachments"
    );
}

#[test]
fn sweep_removes_only_directories_older_than_720_hours() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0);
    let now = SystemTime::now();
    let root = store.root().to_path_buf();
    for (name, age) in [("old", 31 * DAY), ("edge", 30 * DAY), ("fresh", DAY)] {
        let dir = root.join(name);
        fs::create_dir_all(dir.join("k")).unwrap();
        fs::write(dir.join("k/f.txt"), b"x").unwrap();
        set_mtime(&dir, now - age);
    }
    // Old loose files directly under the root are not swept.
    fs::write(root.join("stray.txt"), b"x").unwrap();
    set_mtime(&root.join("stray.txt"), now - 90 * DAY);

    let report = store.sweep_orphans(now).unwrap();
    assert_eq!(
        report,
        SweepReport {
            removed: vec![root.join("old")],
            failed: vec![]
        }
    );
    assert!(!root.join("old").exists());
    assert!(
        root.join("edge").exists(),
        "exactly 720 h is kept (Conductor: age <= avt continues)"
    );
    assert!(root.join("fresh").exists());
    assert!(root.join("stray.txt").exists());
}

#[test]
fn sweep_without_root_is_a_no_op() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0.join("nope"));
    assert_eq!(
        store.sweep_orphans(SystemTime::now()).unwrap(),
        SweepReport::default()
    );
}

#[test]
fn sweep_treats_future_mtimes_as_fresh() {
    let tmp = TempDir::new();
    let store = DraftAttachments::new(&tmp.0);
    let dir = store.root().join("future");
    fs::create_dir_all(&dir).unwrap();
    let now = SystemTime::now();
    set_mtime(&dir, now + DAY);
    assert_eq!(store.sweep_orphans(now).unwrap(), SweepReport::default());
    assert!(dir.exists());
}
