use openconductor_db::{favorite_models, iso_time, open_in_memory, Scope};

fn scope(organization_id: &str, user_id: &str) -> Scope {
    Scope {
        hosting_server_url: None,
        organization_id: organization_id.into(),
        user_id: user_id.into(),
    }
}

fn favs(items: &[(&str, &str)]) -> Vec<(String, String)> {
    items
        .iter()
        .map(|(id, cfg)| (id.to_string(), cfg.to_string()))
        .collect()
}

const T1: i64 = 1_793_880_000_000;
const T2: i64 = T1 + 1_000;

#[tokio::test]
async fn replace_orders_by_position_and_keeps_created_at() {
    let pool = open_in_memory().await.unwrap();
    assert!(favorite_models::list(&pool, &scope("org", "u"))
        .await
        .unwrap()
        .is_empty());
    favorite_models::replace(
        &pool,
        &scope("org", "u"),
        &favs(&[
            ("opus", r#"{"model":"opus"}"#),
            ("gpt", r#"{"model":"gpt"}"#),
        ]),
        T1,
    )
    .await
    .unwrap();
    favorite_models::replace(
        &pool,
        &scope("org", "u"),
        &favs(&[("new", "{}"), ("gpt", r#"{"model":"gpt","fast":true}"#)]),
        T2,
    )
    .await
    .unwrap();

    let list = favorite_models::list(&pool, &scope("org", "u"))
        .await
        .unwrap();
    assert_eq!(
        list.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(),
        ["new", "gpt"]
    );
    assert_eq!(list[0].created_at, iso_time::from_millis(T2));
    assert_eq!(
        list[1].created_at,
        iso_time::from_millis(T1),
        "kept for a stored id"
    );
    assert_eq!(list[1].configuration, r#"{"model":"gpt","fast":true}"#);
    let positions: Vec<i64> = sqlx::query_scalar(
        "SELECT position FROM favorite_models WHERE user_id = 'u' ORDER BY position",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(positions, [0, 1]);
}

#[tokio::test]
async fn replace_is_scoped_and_empty_clears() {
    let pool = open_in_memory().await.unwrap();
    favorite_models::replace(&pool, &scope("org", "u"), &favs(&[("a", "{}")]), T1)
        .await
        .unwrap();
    favorite_models::replace(&pool, &scope("org", "v"), &favs(&[("b", "{}")]), T1)
        .await
        .unwrap();
    favorite_models::replace(&pool, &scope("org", "u"), &[], T2)
        .await
        .unwrap();
    assert!(favorite_models::list(&pool, &scope("org", "u"))
        .await
        .unwrap()
        .is_empty());
    assert_eq!(
        favorite_models::list(&pool, &scope("org", "v"))
            .await
            .unwrap()
            .len(),
        1
    );
    assert!(favorite_models::list(&pool, &scope("other", "v"))
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn failed_replace_rolls_back() {
    let pool = open_in_memory().await.unwrap();
    favorite_models::replace(&pool, &scope("org", "u"), &favs(&[("a", "{}")]), T1)
        .await
        .unwrap();
    sqlx::query(
        "CREATE TRIGGER no_b BEFORE INSERT ON favorite_models WHEN NEW.id = 'b' \
         BEGIN SELECT RAISE(ABORT, 'no b'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        favorite_models::replace(&pool, &scope("org", "u"), &favs(&[("b", "{}")]), T2)
            .await
            .is_err()
    );
    let list = favorite_models::list(&pool, &scope("org", "u"))
        .await
        .unwrap();
    assert_eq!(list.len(), 1, "the delete was rolled back");
    assert_eq!(list[0].id, "a");
}
