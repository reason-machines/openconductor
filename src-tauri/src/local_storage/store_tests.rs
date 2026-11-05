use super::*;

use std::sync::atomic::{AtomicU32, Ordering};

fn temp_root(name: &str) -> PathBuf {
    static N: AtomicU32 = AtomicU32::new(0);
    let dir = std::env::temp_dir().join(format!(
        "oc-local-storage-{name}-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn set(s: &LocalStorage, subsystem: &str, limit: u64, id: &str, content: &str, at: &str) -> SetResult {
    s.set_entry(SetEntry {
        subsystem,
        size_limit: limit,
        id,
        content,
        last_updated_at: Some(at.to_string()),
        entry_storage: None,
        only_if_missing: false,
    })
    .unwrap()
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn ok() -> SetResult {
    SetResult::OK
}

fn failed(r: SetFailure) -> SetResult {
    SetResult::failed(r)
}

#[test]
fn subsystem_files_have_the_reference_names() {
    let s = LocalStorage::new("/r");
    // The 11 subsystems found next to Conductor's databases (evidence/sqlite/README.md).
    let expected = [
        ("browser-local-storage", "local-storage.subsystem.browser-local-storage.json"),
        ("claude-context-windows", "local-storage.subsystem.claude-context-windows.json"),
        ("composer-drafts", "local-storage.subsystem.composer-drafts.json"),
        ("dispatcher-state", "local-storage.subsystem.dispatcher-state.json"),
        ("model-picker-configs-v1", "local-storage.subsystem.model-picker-configs-v1.json"),
        ("opencode-model-discovery-v1", "local-storage.subsystem.opencode-model-discovery-v1.json"),
        ("pre-workspace-completions-v1", "local-storage.subsystem.pre-workspace-completions-v1.json"),
        ("route-user-state", "local-storage.subsystem.route-user-state.json"),
        ("run-script-history", "local-storage.subsystem.run-script-history.json"),
        ("terminal", "local-storage.subsystem.terminal.json"),
        ("turn-changes-cache", "local-storage.subsystem.turn-changes-cache.json"),
    ];
    for (name, file) in expected {
        assert_eq!(s.subsystem_store_path(name), Path::new("/r").join(file));
    }
    assert_eq!(subsystem_store_file_name("a b/ü"), "local-storage.subsystem.a%20b%2F%C3%BC.json");
    assert_eq!(s.metadata_path(), Path::new("/r/local-storage.metadata.json"));
    assert_eq!(
        s.entry_file_path("lottie-sprite-cache", "1:a b"),
        Path::new("/r/local-storage.entries/lottie-sprite-cache/1%3Aa%20b.json")
    );
    let long = "x".repeat(300);
    let name = s.entry_file_path("sub", &long).file_name().unwrap().to_str().unwrap().to_string();
    assert!(name.starts_with("%local-storage-entry-sha256-") && name.ends_with(".json"));
    assert_eq!(name.len(), "%local-storage-entry-sha256-".len() + 64 + ".json".len());
}

#[test]
fn round_trip_writes_the_reference_layout() {
    let root = temp_root("layout");
    let s = LocalStorage::new(&root);
    let draft = r#"{"message":"hä","attachments":[]}"#;
    assert_eq!(set(&s, "composer-drafts", 5 * 1024 * 1024, "sess-1", draft, "2026-11-05T10:00:00.000Z"), ok());
    assert_eq!(s.get_entry("composer-drafts", "sess-1").unwrap().as_deref(), Some(draft));
    assert_eq!(s.get_entry("composer-drafts", "nope").unwrap(), None);
    assert_eq!(s.get_entry("other", "sess-1").unwrap(), None);

    // Index: name -> {subsystem, sizeLimit, totalSize, entryStorage, entries}; no protection key.
    let size = draft.len() as u64; // UTF-8 bytes ("ä" is 2), as TextEncoder counts
    assert_eq!(size, draft.chars().count() as u64 + 1);
    assert_eq!(
        read_json(&s.metadata_path()),
        serde_json::json!({"composer-drafts": {
            "subsystem": "composer-drafts", "sizeLimit": 5242880, "totalSize": size,
            "entryStorage": "subsystemStore",
            "entries": [{"id": "sess-1", "size": size, "lastUpdatedAt": "2026-11-05T10:00:00.000Z"}]
        }})
    );
    // Store file: id -> the JSON text, as a string.
    assert_eq!(
        read_json(&s.subsystem_store_path("composer-drafts")),
        serde_json::json!({"sess-1": draft})
    );
    let listed = s.list_entries("composer-drafts").unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].content, draft);
    assert_eq!(
        serde_json::to_value(&listed[0]).unwrap(),
        serde_json::json!({"id": "sess-1", "size": size, "lastUpdatedAt": "2026-11-05T10:00:00.000Z", "content": draft})
    );
    let info = s.get_subsystem("composer-drafts").unwrap().unwrap();
    assert_eq!(info.entry_storage, EntryStorage::SubsystemStore);
    assert_eq!(info.total_size, size);
    assert_eq!(s.list_subsystems().unwrap(), vec!["composer-drafts".to_string()]);
    assert_eq!(s.list_entries("missing").unwrap(), vec![]);
}

#[test]
fn replacing_an_entry_moves_it_last_and_keeps_totals() {
    let root = temp_root("replace");
    let s = LocalStorage::new(&root);
    set(&s, "t", 100, "a", "\"aaaa\"", "2026-01-01T00:00:00.000Z");
    set(&s, "t", 100, "b", "\"bb\"", "2026-01-02T00:00:00.000Z");
    set(&s, "t", 100, "a", "1", "2026-01-03T00:00:00.000Z");
    let info = s.get_subsystem("t").unwrap().unwrap();
    let ids: Vec<_> = info.entries.iter().map(|e| e.id.as_str()).collect();
    assert_eq!(ids, ["b", "a"]);
    assert_eq!(info.total_size, 4 + 1);
    assert_eq!(s.get_entry("t", "a").unwrap().as_deref(), Some("1"));
}

#[test]
fn evicts_least_recently_updated_others_and_refuses_what_cannot_fit() {
    let root = temp_root("evict");
    let s = LocalStorage::new(&root);
    // 3 bytes each.
    set(&s, "t", 9, "a", "\"a\"", "2026-01-02T00:00:00.000Z");
    set(&s, "t", 9, "b", "\"b\"", "2026-01-01T00:00:00.000Z");
    set(&s, "t", 9, "c", "\"c\"", "2026-01-01T00:00:00.000Z");
    // d needs room: b is oldest (ties keep the first listed), so b goes, not c.
    assert_eq!(set(&s, "t", 9, "d", "\"d\"", "2026-01-03T00:00:00.000Z"), ok());
    let ids: Vec<_> = s.get_subsystem("t").unwrap().unwrap().entries.into_iter().map(|e| e.id).collect();
    assert_eq!(ids, ["a", "c", "d"]);
    assert_eq!(read_json(&s.subsystem_store_path("t")).as_object().unwrap().len(), 3);
    assert_eq!(s.get_entry("t", "b").unwrap(), None);

    // Larger than the limit by itself: refused before anything changes.
    assert_eq!(set(&s, "t", 9, "e", "\"0123456789\"", "2026-01-04T00:00:00.000Z"), failed(SetFailure::EntryTooLarge));
    assert_eq!(s.get_subsystem("t").unwrap().unwrap().entries.len(), 3);

    // An index whose total is wrong can leave no room even after evicting everything.
    let mut index = read_json(&s.metadata_path());
    index["t"]["totalSize"] = serde_json::json!(1000);
    fs::write(s.metadata_path(), index.to_string()).unwrap();
    assert_eq!(set(&s, "t", 9, "f", "\"f\"", "2026-01-05T00:00:00.000Z"), failed(SetFailure::SubsystemFull));
}

#[test]
fn storage_mismatch_only_if_missing_and_bad_json() {
    let root = temp_root("mismatch");
    let s = LocalStorage::new(&root);
    set(&s, "turn-changes-cache", 100, "k", "[]", "2026-01-01T00:00:00.000Z");
    let mut req = SetEntry {
        subsystem: "turn-changes-cache",
        size_limit: 100,
        id: "k",
        content: "[1]",
        last_updated_at: None,
        entry_storage: Some(EntryStorage::EntryFile),
        only_if_missing: false,
    };
    assert_eq!(s.set_entry(req.clone()).unwrap(), failed(SetFailure::EntryStorageMismatch));
    req.entry_storage = Some(EntryStorage::SubsystemStore);
    req.only_if_missing = true;
    assert_eq!(s.set_entry(req.clone()).unwrap(), ok());
    assert_eq!(s.get_entry("turn-changes-cache", "k").unwrap().as_deref(), Some("[]"));
    req.content = "not json";
    req.only_if_missing = false;
    assert_eq!(s.set_entry(req.clone()).unwrap(), failed(SetFailure::NotJsonSerializable));
    assert_eq!(serde_json::to_string(&failed(SetFailure::EntryStorageMismatch)).unwrap(),
        r#"{"success":false,"reason":"entryStorageMismatch"}"#);
    assert_eq!(serde_json::to_string(&ok()).unwrap(), r#"{"success":true}"#);
    // A new subsystem's storage defaults to subsystemStore.
    req.subsystem = "fresh";
    req.content = "{}";
    req.entry_storage = None;
    s.set_entry(req).unwrap();
    assert_eq!(s.get_subsystem("fresh").unwrap().unwrap().entry_storage, EntryStorage::SubsystemStore);
}

#[test]
fn remove_entry_and_subsystem() {
    let root = temp_root("remove");
    let s = LocalStorage::new(&root);
    set(&s, "a", 100, "x", "1", "2026-01-01T00:00:00.000Z");
    set(&s, "a", 100, "y", "22", "2026-01-01T00:00:00.000Z");
    set(&s, "b", 100, "x", "3", "2026-01-01T00:00:00.000Z");
    s.remove_entry("a", "x").unwrap();
    s.remove_entry("a", "never").unwrap();
    let info = s.get_subsystem("a").unwrap().unwrap();
    assert_eq!(info.total_size, 2);
    assert_eq!(read_json(&s.subsystem_store_path("a")), serde_json::json!({"y": "22"}));
    s.remove_subsystem("a").unwrap();
    assert!(!s.subsystem_store_path("a").exists());
    assert_eq!(s.get_subsystem("a").unwrap(), None);
    assert_eq!(s.list_subsystems().unwrap(), vec!["b".to_string()]);
    assert_eq!(s.get_entry("b", "x").unwrap().as_deref(), Some("3"));
}

#[test]
fn unreadable_store_is_discarded_and_missing_content_is_an_error() {
    let root = temp_root("discard");
    let s = LocalStorage::new(&root);
    set(&s, "a", 100, "x", "1", "2026-01-01T00:00:00.000Z");
    fs::write(s.subsystem_store_path("a"), "{not json").unwrap();
    // Index still lists x, but its store was discarded.
    assert!(matches!(s.get_entry("a", "x"), Err(StoreError::MissingContent { .. })));
    assert!(s.list_entries("a").is_err());
    // A write rebuilds the store from scratch.
    set(&s, "a", 100, "z", "2", "2026-01-02T00:00:00.000Z");
    assert_eq!(read_json(&s.subsystem_store_path("a")), serde_json::json!({"z": "2"}));
    // An unreadable index is discarded too.
    fs::write(s.metadata_path(), "[]").unwrap();
    assert_eq!(s.list_subsystems().unwrap(), Vec::<String>::new());
}

#[test]
fn rolls_back_content_when_the_index_cannot_be_written() {
    let root = temp_root("rollback");
    let s = LocalStorage::new(&root);
    set(&s, "a", 100, "x", "\"old\"", "2026-01-01T00:00:00.000Z");
    // A directory where the index file goes makes the index write fail; the
    // new entry's content is taken back out of the store file.
    fs::remove_file(s.metadata_path()).unwrap();
    fs::create_dir(s.metadata_path()).unwrap();
    assert!(set_err(&s, "a", "y"));
    assert_eq!(read_json(&s.subsystem_store_path("a")), serde_json::json!({"x": "\"old\""}));
}

fn set_err(s: &LocalStorage, subsystem: &str, id: &str) -> bool {
    s.set_entry(SetEntry {
        subsystem,
        size_limit: 100,
        id,
        content: "\"new\"",
        last_updated_at: None,
        entry_storage: Some(EntryStorage::SubsystemStore),
        only_if_missing: false,
    })
    .is_err()
}

#[test]
fn encrypted_subsystems_are_left_to_the_terminal_history_store() {
    let root = temp_root("encrypted");
    let s = LocalStorage::new(&root);
    let record = serde_json::json!({"terminal-history": {
        "subsystem": "terminal-history", "sizeLimit": 52428800, "totalSize": 0,
        "entryStorage": "entryFile", "protection": "encrypted", "entries": []
    }});
    fs::write(s.metadata_path(), record.to_string()).unwrap();
    assert!(matches!(s.get_entry("terminal-history", "x"), Err(StoreError::Encrypted(_))));
    assert!(matches!(
        s.set_entry(SetEntry {
            subsystem: "terminal-history",
            size_limit: 10,
            id: "x",
            content: "1",
            last_updated_at: None,
            entry_storage: None,
            only_if_missing: false
        }),
        Err(StoreError::Encrypted(_))
    ));
    assert!(s.remove_subsystem("terminal-history").is_err());
    set(&s, "terminal", 100, "terminal-panel-tabs-v1", "\"{}\"", "2026-01-01T00:00:00.000Z");
    let index = read_json(&s.metadata_path());
    assert_eq!(index["terminal-history"], record["terminal-history"]);
    assert_eq!(s.get_subsystem("terminal-history").unwrap().unwrap().protection.as_deref(), Some("encrypted"));
    assert_eq!(s.list_subsystems().unwrap(), vec!["terminal".to_string(), "terminal-history".to_string()]);
}

#[test]
fn plain_entry_files() {
    let root = temp_root("entryfile");
    let s = LocalStorage::new(&root);
    let req = |id: &'static str, at: &'static str| SetEntry {
        subsystem: "lottie-sprite-cache",
        size_limit: 8,
        id,
        content: "\"ab\"",
        last_updated_at: Some(at.to_string()),
        entry_storage: Some(EntryStorage::EntryFile),
        only_if_missing: false,
    };
    assert_eq!(s.set_entry(req("1:a", "2026-01-01T00:00:00.000Z")).unwrap(), ok());
    let path = s.entry_file_path("lottie-sprite-cache", "1:a");
    assert_eq!(fs::read_to_string(&path).unwrap(), "\"ab\"");
    assert!(!s.subsystem_store_path("lottie-sprite-cache").exists());
    assert_eq!(s.set_entry(req("2:b", "2026-01-02T00:00:00.000Z")).unwrap(), ok());
    assert_eq!(s.set_entry(req("3:c", "2026-01-03T00:00:00.000Z")).unwrap(), ok());
    assert!(!path.exists(), "evicted entry file is deleted");
    assert_eq!(s.list_entries("lottie-sprite-cache").unwrap().len(), 2);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let dir = s.entry_file_path("lottie-sprite-cache", "x").parent().unwrap().to_path_buf();
        assert_eq!(fs::metadata(dir).unwrap().permissions().mode() & 0o777, 0o700);
    }
}

#[cfg(unix)]
#[test]
fn store_files_are_private() {
    use std::os::unix::fs::PermissionsExt;
    let root = temp_root("modes");
    let s = LocalStorage::new(&root);
    set(&s, "a", 100, "x", "1", "2026-01-01T00:00:00.000Z");
    for p in [s.metadata_path(), s.subsystem_store_path("a")] {
        assert_eq!(fs::metadata(&p).unwrap().permissions().mode() & 0o777, 0o600, "{}", p.display());
    }
    // No temp files left behind.
    let names: Vec<_> = fs::read_dir(&root).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(names.len(), 2, "{names:?}");
}

#[test]
fn timestamps_match_to_iso_string() {
    assert_eq!(iso_from_millis(0), "1970-01-01T00:00:00.000Z");
    assert_eq!(iso_from_millis(1_762_336_800_123), "2025-11-05T10:00:00.123Z");
    let now = iso_now();
    assert_eq!(now.len(), 24);
    assert!(now.ends_with('Z'));
}
