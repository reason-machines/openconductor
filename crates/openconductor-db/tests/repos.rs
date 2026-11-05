use openconductor_db::repos::{self, NewRepo};
use openconductor_db::{open_in_memory, Error};
use sqlx::SqlitePool;

fn new_repo(id: &str) -> NewRepo {
    NewRepo {
        id: id.into(),
        name: format!("{id}-name"),
        root_path: format!("/src/{id}"),
        ..Default::default()
    }
}

async fn add_workspace(pool: &SqlitePool, local_id: &str, repo_id: &str) {
    sqlx::query("INSERT INTO workspaces (local_id, repository_id, state) VALUES (?, ?, 'ready')")
        .bind(local_id)
        .bind(repo_id)
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn insert_applies_defaults_and_appends_to_the_list() {
    let pool = open_in_memory().await.unwrap();
    let a = repos::insert(&pool, &new_repo("a")).await.unwrap();
    assert_eq!(a.default_branch.as_deref(), Some("main"));
    assert_eq!(
        (a.display_order, a.storage_version, a.hidden),
        (0, 1, false)
    );
    assert_eq!(
        repos::insert(&pool, &new_repo("b"))
            .await
            .unwrap()
            .display_order,
        1
    );
    let ids: Vec<_> = repos::list(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|r| r.id)
        .collect();
    assert_eq!(ids, ["a", "b"]);
    assert_eq!(repos::get(&pool, "a").await.unwrap(), Some(a));
    assert_eq!(repos::get(&pool, "missing").await.unwrap(), None);
}

#[tokio::test]
async fn duplicate_id_is_rejected() {
    let pool = open_in_memory().await.unwrap();
    repos::insert(&pool, &new_repo("a")).await.unwrap();
    assert!(matches!(
        repos::insert(&pool, &new_repo("a")).await,
        Err(Error::Sqlx(_))
    ));
}

#[tokio::test]
async fn reorder_sets_list_order() {
    let pool = open_in_memory().await.unwrap();
    for id in ["a", "b", "c"] {
        repos::insert(&pool, &new_repo(id)).await.unwrap();
    }
    repos::reorder(&pool, &["c", "a", "b"]).await.unwrap();
    let ids: Vec<_> = repos::list(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|r| r.id)
        .collect();
    assert_eq!(ids, ["c", "a", "b"]);
    // An unknown id rolls the whole reorder back.
    assert!(matches!(
        repos::reorder(&pool, &["b", "nope"]).await,
        Err(Error::NotFound)
    ));
    let ids: Vec<_> = repos::list(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|r| r.id)
        .collect();
    assert_eq!(ids, ["c", "a", "b"]);
}

#[tokio::test]
async fn hidden_unused_repo_is_reusable_for_its_path() {
    let pool = open_in_memory().await.unwrap();
    repos::insert(
        &pool,
        &NewRepo {
            hidden: true,
            ..new_repo("a")
        },
    )
    .await
    .unwrap();
    repos::insert(&pool, &new_repo("b")).await.unwrap();
    let reuse = repos::find_reusable_hidden(&pool, "/src/a").await.unwrap();
    assert_eq!(reuse.as_deref(), Some("a"));
    assert_eq!(
        repos::find_reusable_hidden(&pool, "/src/b").await.unwrap(),
        None
    );
    add_workspace(&pool, "w1", "a").await;
    assert_eq!(
        repos::find_reusable_hidden(&pool, "/src/a").await.unwrap(),
        None
    );
}

#[tokio::test]
async fn delete_respects_workspaces() {
    let pool = open_in_memory().await.unwrap();
    repos::insert(&pool, &new_repo("a")).await.unwrap();
    repos::insert(&pool, &new_repo("b")).await.unwrap();
    add_workspace(&pool, "w1", "a").await;
    add_workspace(&pool, "w2", "b").await;

    assert!(!repos::delete_if_unused(&pool, "a").await.unwrap());
    assert!(repos::get(&pool, "a").await.unwrap().is_some());

    repos::delete_with_workspaces(&pool, "a").await.unwrap();
    assert!(repos::get(&pool, "a").await.unwrap().is_none());
    let left: Vec<String> = sqlx::query_scalar("SELECT local_id FROM workspaces")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(left, ["w2"]);

    sqlx::query("DELETE FROM workspaces")
        .execute(&pool)
        .await
        .unwrap();
    assert!(repos::delete_if_unused(&pool, "b").await.unwrap());
    assert!(matches!(
        repos::delete_with_workspaces(&pool, "b").await,
        Err(Error::NotFound)
    ));
}
