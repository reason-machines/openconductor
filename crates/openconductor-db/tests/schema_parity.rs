//! A freshly migrated database must have exactly the reference schema:
//! the same tables with the same columns (order, declared type, NOT NULL,
//! default, primary key), the same indexes (columns, uniqueness, partial
//! WHERE clause) and the same triggers.

use std::collections::BTreeMap;
use std::str::FromStr;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::Row;

const REFERENCE_DDL: &str = include_str!("../../../evidence/sqlite/conductor.schema.sql");

/// Normalised description of one schema object, keyed by object name.
type Schema = BTreeMap<String, String>;

fn squash(sql: &str) -> String {
    sql.split_whitespace().collect::<Vec<_>>().join(" ")
}

async fn describe(pool: &SqlitePool) -> Schema {
    let objects = sqlx::query(
        "SELECT type, name, tbl_name, sql FROM sqlite_master \
         WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .unwrap();

    let mut schema = Schema::new();
    for object in objects {
        let kind: String = object.get("type");
        let name: String = object.get("name");
        let table: String = object.get("tbl_name");
        let sql: Option<String> = object.get("sql");
        let description = match kind.as_str() {
            "table" => {
                let columns = sqlx::query(
                    "SELECT cid, name, type, \"notnull\", dflt_value, pk \
                     FROM pragma_table_info(?) ORDER BY cid",
                )
                .bind(&name)
                .fetch_all(pool)
                .await
                .unwrap();
                columns
                    .iter()
                    .map(|c| {
                        format!(
                            "{} {:?} notnull={} default={:?} pk={}",
                            c.get::<String, _>("name"),
                            c.get::<String, _>("type"),
                            c.get::<i64, _>("notnull"),
                            c.get::<Option<String>, _>("dflt_value"),
                            c.get::<i64, _>("pk"),
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            "index" => {
                let columns: Vec<String> =
                    sqlx::query_scalar("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
                        .bind(&name)
                        .fetch_all(pool)
                        .await
                        .unwrap();
                let sql = squash(&sql.unwrap_or_default());
                let unique = sql.starts_with("CREATE UNIQUE");
                let partial = sql
                    .rsplit_once(" WHERE ")
                    .map(|(_, w)| w.to_string())
                    .unwrap_or_default();
                format!(
                    "on {table} ({}) unique={unique} where={partial:?}",
                    columns.join(", ")
                )
            }
            "trigger" => {
                // Compare the trigger body after its header, whitespace-squashed.
                let sql = squash(&sql.unwrap_or_default());
                let body = sql.split_once(" BEGIN ").map(|(_, b)| b.to_string());
                format!("on {table}: {body:?}")
            }
            other => format!("{other} on {table}"),
        };
        schema.insert(format!("{kind} {name}"), description);
    }
    schema
}

async fn memory_pool() -> SqlitePool {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(SqliteConnectOptions::from_str("sqlite::memory:").unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn migrated_schema_matches_reference() {
    let reference = memory_pool().await;
    sqlx::raw_sql(REFERENCE_DDL)
        .execute(&reference)
        .await
        .unwrap();
    let expected = describe(&reference).await;

    let migrated = openconductor_db::open_in_memory().await.unwrap();
    let actual = describe(&migrated).await;

    let missing: Vec<_> = expected
        .keys()
        .filter(|k| !actual.contains_key(*k))
        .collect();
    let extra: Vec<_> = actual
        .keys()
        .filter(|k| !expected.contains_key(*k))
        .collect();
    assert!(
        missing.is_empty(),
        "objects missing from migrations: {missing:#?}"
    );
    assert!(extra.is_empty(), "objects not in the reference: {extra:#?}");
    for (key, want) in &expected {
        assert_eq!(&actual[key], want, "{key} differs from the reference");
    }
}

#[tokio::test]
async fn migrations_are_idempotent_and_recorded() {
    let pool = openconductor_db::open_in_memory().await.unwrap();
    openconductor_db::MIGRATOR.run(&pool).await.unwrap();
    let applied: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(applied as usize, openconductor_db::MIGRATOR.iter().count());
}

#[tokio::test]
async fn open_creates_a_wal_database_file() {
    let dir = std::env::temp_dir().join(format!("ocdb-open-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("conductor.db");
    let _ = std::fs::remove_file(&path);
    let pool = openconductor_db::open(&path).await.unwrap();
    let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(mode, "wal");
    pool.close().await;
    assert!(path.exists());
    std::fs::remove_dir_all(&dir).unwrap();
}
