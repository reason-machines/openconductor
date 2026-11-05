use openconductor_db::env_vars::{self, EnvVar};
use openconductor_db::open_in_memory;

fn var(key: &str, context: &str, value: Option<&str>) -> EnvVar {
    EnvVar {
        key: key.into(),
        scope: "shared".into(),
        context: context.into(),
        value: value.map(Into::into),
    }
}

#[tokio::test]
async fn set_is_scoped_by_scope_and_context() {
    let pool = open_in_memory().await.unwrap();
    env_vars::set(&pool, "API_KEY", "shared", "local", "a")
        .await
        .unwrap();
    env_vars::set(&pool, "API_KEY", "shared", "cloud", "b")
        .await
        .unwrap();
    env_vars::set(&pool, "OTHER", "shared", "local", "c")
        .await
        .unwrap();

    let mut local = env_vars::list(&pool, "shared", "local").await.unwrap();
    local.sort_by(|a, b| a.key.cmp(&b.key));
    assert_eq!(
        local,
        [
            var("API_KEY", "local", Some("a")),
            var("OTHER", "local", Some("c"))
        ]
    );
    assert_eq!(
        env_vars::list(&pool, "shared", "cloud").await.unwrap(),
        [var("API_KEY", "cloud", Some("b"))]
    );
    assert!(env_vars::list(&pool, "user", "local")
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn set_replaces_and_secret_store_nulls_the_value() {
    let pool = open_in_memory().await.unwrap();
    env_vars::set(&pool, "K", "shared", "local", "one")
        .await
        .unwrap();
    env_vars::set(&pool, "K", "shared", "local", "two")
        .await
        .unwrap();
    assert_eq!(
        env_vars::list(&pool, "shared", "local").await.unwrap(),
        [var("K", "local", Some("two"))]
    );

    env_vars::set_in_secret_store(&pool, "K", "shared", "local")
        .await
        .unwrap();
    env_vars::set_in_secret_store(&pool, "NEW", "shared", "local")
        .await
        .unwrap();
    let mut rows = env_vars::list(&pool, "shared", "local").await.unwrap();
    rows.sort_by(|a, b| a.key.cmp(&b.key));
    assert_eq!(rows, [var("K", "local", None), var("NEW", "local", None)]);
}

#[tokio::test]
async fn delete_removes_only_that_scope_and_context() {
    let pool = open_in_memory().await.unwrap();
    env_vars::set(&pool, "K", "shared", "local", "a")
        .await
        .unwrap();
    env_vars::set(&pool, "K", "shared", "cloud", "b")
        .await
        .unwrap();
    env_vars::delete(&pool, "K", "shared", "local")
        .await
        .unwrap();
    env_vars::delete(&pool, "K", "shared", "local")
        .await
        .unwrap();
    assert!(env_vars::list(&pool, "shared", "local")
        .await
        .unwrap()
        .is_empty());
    assert_eq!(
        env_vars::list(&pool, "shared", "cloud")
            .await
            .unwrap()
            .len(),
        1
    );
}
