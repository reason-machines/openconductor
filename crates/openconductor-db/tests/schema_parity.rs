//! A freshly migrated database must have exactly the reference schema:
//! the same tables with the same columns (order, declared type, NOT NULL,
//! default, primary key), the same indexes (columns, uniqueness, partial
//! WHERE clause) and the same triggers. This holds for both databases the
//! reference keeps: `conductor.db` and `cache.db`.

use std::collections::BTreeMap;
use std::str::FromStr;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::Row;

const REFERENCE_DDL: &str = include_str!("../../../evidence/sqlite/conductor.schema.sql");
const REFERENCE_CACHE_DDL: &str = include_str!("../../../evidence/sqlite/cache.schema.sql");

/// Reference `cache.db` `_sqlx_migrations` rows (version, description), from
/// `evidence/sqlite/rea-inspect-sqlite-cache-migrations.json`.
const REFERENCE_CACHE_MIGRATIONS: [(i64, &str); 6] = [
    (1, "create session cache"),
    (2, "drop obsolete session tool cache"),
    (3, "create session pending messages mirror"),
    (4, "create navigation sections cache"),
    (5, "create favorite models cache"),
    (6, "add navigation section emoji to cache"),
];

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

/// Fail unless `migrated` has exactly the schema `reference_ddl` creates.
async fn assert_matches_reference(reference_ddl: &str, migrated: &SqlitePool) {
    let reference = memory_pool().await;
    sqlx::raw_sql(reference_ddl)
        .execute(&reference)
        .await
        .unwrap();
    let expected = describe(&reference).await;
    let actual = describe(migrated).await;

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
async fn migrated_schema_matches_reference() {
    let migrated = openconductor_db::open_in_memory().await.unwrap();
    assert_matches_reference(REFERENCE_DDL, &migrated).await;
}

#[tokio::test]
async fn migrated_cache_schema_matches_reference() {
    let migrated = openconductor_db::open_cache_in_memory().await.unwrap();
    assert_matches_reference(REFERENCE_CACHE_DDL, &migrated).await;
}

#[tokio::test]
async fn cache_migrations_match_reference_versions_and_descriptions() {
    let pool = openconductor_db::open_cache_in_memory().await.unwrap();
    openconductor_db::CACHE_MIGRATOR.run(&pool).await.unwrap();
    let applied: Vec<(i64, String)> = sqlx::query_as(
        "SELECT version, description FROM _sqlx_migrations WHERE success = 1 ORDER BY version",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let expected: Vec<(i64, String)> = REFERENCE_CACHE_MIGRATIONS
        .iter()
        .map(|(v, d)| (*v, d.to_string()))
        .collect();
    assert_eq!(applied, expected);
}

#[tokio::test]
async fn open_cache_creates_a_wal_database_file() {
    let dir = std::env::temp_dir().join(format!("ocdb-cache-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("cache.db");
    let _ = std::fs::remove_file(&path);
    let pool = openconductor_db::open_cache(&path).await.unwrap();
    let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(mode, "wal");
    pool.close().await;
    assert!(path.exists());
    std::fs::remove_dir_all(&dir).unwrap();
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
