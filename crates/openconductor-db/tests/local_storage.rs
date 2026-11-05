use openconductor_db::local_storage::{LocalStorage, Subsystem};
use serde_json::json;

fn temp_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("ocls-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

#[test]
fn eleven_subsystems_have_distinct_file_names() {
    let mut names: Vec<&str> = Subsystem::ALL.iter().map(|s| s.file_name()).collect();
    assert_eq!(names.len(), 11);
    names.sort();
    names.dedup();
    assert_eq!(names.len(), 11);
    assert!(names.contains(&"local-storage.subsystem.composer-drafts.json"));
    assert!(names.contains(&"local-storage.subsystem.terminal.json"));
}

#[test]
fn missing_subsystem_reads_as_empty() {
    let store = LocalStorage::new(temp_dir("empty"));
    assert!(store.entries(Subsystem::Terminal).unwrap().is_empty());
    assert_eq!(store.get(Subsystem::Terminal, "k").unwrap(), None);
}

#[test]
fn set_get_remove_round_trip_and_survive_reopen() {
    let dir = temp_dir("roundtrip");
    let store = LocalStorage::new(&dir);
    store
        .set(Subsystem::ComposerDrafts, "ws-1", json!({"text": "hi"}))
        .unwrap();
    store
        .set(Subsystem::ComposerDrafts, "ws-2", json!("second"))
        .unwrap();

    let reopened = LocalStorage::new(&dir);
    assert_eq!(
        reopened.get(Subsystem::ComposerDrafts, "ws-1").unwrap(),
        Some(json!({"text": "hi"}))
    );
    assert!(reopened.remove(Subsystem::ComposerDrafts, "ws-1").unwrap());
    assert!(!reopened.remove(Subsystem::ComposerDrafts, "ws-1").unwrap());
    assert_eq!(reopened.entries(Subsystem::ComposerDrafts).unwrap().len(), 1);
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn subsystems_are_isolated_in_their_own_files() {
    let dir = temp_dir("isolated");
    let store = LocalStorage::new(&dir);
    store.set(Subsystem::Terminal, "t", json!(1)).unwrap();
    assert_eq!(store.get(Subsystem::RouteUserState, "t").unwrap(), None);
    assert!(dir.join("local-storage.subsystem.terminal.json").exists());
    assert!(!dir.join("local-storage.subsystem.route-user-state.json").exists());
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn corrupt_file_is_an_error_not_an_empty_store() {
    let dir = temp_dir("corrupt");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("local-storage.subsystem.dispatcher-state.json"), b"{not json").unwrap();
    let store = LocalStorage::new(&dir);
    assert!(store.entries(Subsystem::DispatcherState).is_err());
    std::fs::remove_dir_all(&dir).unwrap();
}
