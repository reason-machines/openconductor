use openconductor_db::port_forwards::{self, NewPortForward};
use openconductor_db::{open_in_memory, SqlitePool};

async fn workspace(pool: &SqlitePool, id: &str, state: &str, dir: &str) {
    sqlx::query(
        "INSERT INTO workspaces (local_id, state, directory_name, repository_id, branch, \
         organization_id, hosting_server_url, port_forwarding_enabled, permission_level) \
         VALUES (?, ?, ?, 'repo', 'main', 'org', 'https://cloud', 1, 'write')",
    )
    .bind(id)
    .bind(state)
    .bind(dir)
    .execute(pool)
    .await
    .unwrap();
}

fn fwd(id: &str, ws: &str, remote: i64, local: i64) -> NewPortForward {
    NewPortForward {
        id: id.into(),
        workspace_id: ws.into(),
        remote_port: remote,
        local_port: local,
        protocol: "tcp".into(),
        label: None,
        auto_detected: false,
    }
}

#[tokio::test]
async fn crud_and_enable_toggle() {
    let pool = open_in_memory().await.unwrap();
    workspace(&pool, "w1", "ready", "w1").await;
    port_forwards::insert(&pool, &fwd("b", "w1", 5173, 20001))
        .await
        .unwrap();
    let mut a = fwd("a", "w1", 3000, 20000);
    a.label = Some("web".into());
    a.auto_detected = true;
    port_forwards::insert(&pool, &a).await.unwrap();

    let list = port_forwards::list_for_workspace(&pool, "w1")
        .await
        .unwrap();
    assert_eq!(
        list.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(),
        ["a", "b"]
    );
    let got = port_forwards::get(&pool, "a").await.unwrap().unwrap();
    assert!(got.enabled, "enabled defaults to 1");
    assert!(got.auto_detected);
    assert_eq!(got.label.as_deref(), Some("web"));
    assert!(got.created_at.is_some());

    port_forwards::set_enabled(&pool, "a", false).await.unwrap();
    assert!(
        !port_forwards::get(&pool, "a")
            .await
            .unwrap()
            .unwrap()
            .enabled
    );
    port_forwards::set_enabled(&pool, "a", true).await.unwrap();
    assert!(
        port_forwards::get(&pool, "a")
            .await
            .unwrap()
            .unwrap()
            .enabled
    );

    assert!(port_forwards::set_local_port(&pool, "a", 20005)
        .await
        .unwrap());
    assert!(!port_forwards::set_local_port(&pool, "missing", 20006)
        .await
        .unwrap());
    assert_eq!(
        port_forwards::get(&pool, "a")
            .await
            .unwrap()
            .unwrap()
            .local_port,
        Some(20005)
    );

    port_forwards::delete(&pool, "a").await.unwrap();
    assert_eq!(port_forwards::get(&pool, "a").await.unwrap(), None);
    port_forwards::delete_for_workspace(&pool, "w1")
        .await
        .unwrap();
    assert!(port_forwards::list_for_workspace(&pool, "w1")
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn unique_indexes_reject_duplicates() {
    let pool = open_in_memory().await.unwrap();
    workspace(&pool, "w1", "ready", "w1").await;
    port_forwards::insert(&pool, &fwd("a", "w1", 3000, 20000))
        .await
        .unwrap();
    assert!(port_forwards::insert(&pool, &fwd("b", "w1", 3000, 20001))
        .await
        .is_err());
    assert!(port_forwards::insert(&pool, &fwd("c", "w1", 4000, 20000))
        .await
        .is_err());
}

#[tokio::test]
async fn pruning_and_allocation_queries() {
    let pool = open_in_memory().await.unwrap();
    workspace(&pool, "live", "ready", "live").await;
    workspace(&pool, "old", "archived", "old").await;
    port_forwards::insert(&pool, &fwd("live", "live", 3000, 20000))
        .await
        .unwrap();
    port_forwards::insert(&pool, &fwd("old", "old", 3000, 20001))
        .await
        .unwrap();
    port_forwards::insert(&pool, &fwd("gone", "nope", 3000, 20002))
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO port_forwards (id, workspace_id, local_port) VALUES ('half', 'live', 20003)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let mut ports = port_forwards::allocated_local_ports(&pool).await.unwrap();
    ports.sort();
    assert_eq!(
        ports,
        [20000, 20001, 20003],
        "only forwards of existing workspaces"
    );

    let holders = port_forwards::holders_of_local_port(&pool, 20002)
        .await
        .unwrap();
    assert_eq!(holders.len(), 1);
    assert_eq!(
        holders[0].port_forwarding_enabled, None,
        "workspace row is gone"
    );

    assert_eq!(port_forwards::delete_orphans(&pool).await.unwrap(), 2);
    assert_eq!(
        port_forwards::delete_for_archived_workspaces(&pool)
            .await
            .unwrap(),
        1
    );
    let left: Vec<String> = sqlx::query_scalar("SELECT id FROM port_forwards")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(left, ["live"]);
}

#[tokio::test]
async fn ssh_and_hosted_forwards() {
    let pool = open_in_memory().await.unwrap();
    workspace(&pool, "w2", "ready", "beta").await;
    workspace(&pool, "w1", "ready", "alpha").await;
    workspace(&pool, "w3", "archived", "gamma").await;
    port_forwards::insert(&pool, &fwd("s2", "w2", 22, 20010))
        .await
        .unwrap();
    port_forwards::insert(&pool, &fwd("s1", "w1", 22, 20011))
        .await
        .unwrap();
    port_forwards::insert(&pool, &fwd("s3", "w3", 22, 20012))
        .await
        .unwrap();

    let ssh = port_forwards::ssh_forwards(&pool).await.unwrap();
    assert_eq!(
        ssh.iter()
            .map(|s| s.workspace_id.as_str())
            .collect::<Vec<_>>(),
        ["w1", "w2"],
        "ordered by directory name, archived skipped"
    );
    assert_eq!(ssh[0].forward_id, "s1");
    assert_eq!(ssh[0].local_port, Some(20011));

    assert!(
        !port_forwards::organization_has_enabled_forward(&pool, "org", "https://cloud")
            .await
            .unwrap(),
        "SSH forwards do not count"
    );
    port_forwards::insert(&pool, &fwd("web", "w1", 3000, 20013))
        .await
        .unwrap();
    assert!(
        port_forwards::organization_has_enabled_forward(&pool, "org", "https://cloud")
            .await
            .unwrap()
    );
    assert!(
        !port_forwards::organization_has_enabled_forward(&pool, "other", "https://cloud")
            .await
            .unwrap()
    );

    port_forwards::set_enabled(&pool, "s2", false)
        .await
        .unwrap();
    let hosted = port_forwards::enabled_hosted(&pool).await.unwrap();
    let mut ids: Vec<&str> = hosted.iter().map(|h| h.forward.id.as_str()).collect();
    ids.sort();
    assert_eq!(ids, ["s1", "web"]);
    assert!(hosted
        .iter()
        .all(|h| h.hosting_server_url == "https://cloud"));
    assert_eq!(hosted[0].permission_level.as_deref(), Some("write"));
}
