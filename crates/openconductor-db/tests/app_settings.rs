use openconductor_db::repos::{self, NewRepo};
use openconductor_db::{app_settings, open_in_memory, Error};

#[tokio::test]
async fn get_is_none_until_set_and_set_replaces() {
    let pool = open_in_memory().await.unwrap();
    assert_eq!(app_settings::get(&pool, "k").await.unwrap(), None);
    app_settings::set(&pool, "k", "false").await.unwrap();
    app_settings::set(&pool, "k", "true").await.unwrap();
    assert_eq!(
        app_settings::get(&pool, "k").await.unwrap().as_deref(),
        Some("true")
    );
}

#[tokio::test]
async fn clear_spotlight_testing_nulls_only_that_column() {
    let pool = open_in_memory().await.unwrap();
    let repo = NewRepo {
        id: "r".into(),
        name: "r".into(),
        root_path: "/src/r".into(),
        ..Default::default()
    };
    repos::insert(&pool, &repo).await.unwrap();
    let mut s = repos::settings(&pool, "r").await.unwrap();
    s.spotlight_testing = Some(true);
    s.file_include_globs = Some("[\".env\"]".into());
    repos::update_settings(&pool, "r", &s).await.unwrap();

    repos::clear_spotlight_testing(&pool, "r").await.unwrap();
    let after = repos::settings(&pool, "r").await.unwrap();
    assert_eq!(after.spotlight_testing, None);
    assert_eq!(after.file_include_globs.as_deref(), Some("[\".env\"]"));
    assert!(matches!(
        repos::clear_spotlight_testing(&pool, "missing").await,
        Err(Error::NotFound)
    ));
}
