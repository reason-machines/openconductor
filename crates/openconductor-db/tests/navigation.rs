use openconductor_db::iso_time;
use openconductor_db::navigation::{self, Layout, LayoutSection, Scope};
use openconductor_db::open_in_memory;

fn scope(user: &str) -> Scope {
    Scope {
        organization_id: "org".into(),
        user_id: user.into(),
    }
}

fn section(id: &str, name: &str, workspaces: &[&str]) -> LayoutSection {
    LayoutSection {
        id: id.into(),
        name: name.into(),
        emoji: None,
        workspace_ids: workspaces.iter().map(|w| w.to_string()).collect(),
    }
}

/// `layout` with each section's workspaces sorted. Workspaces added to a
/// section in one write share a `created_at` and get random UUIDs, and the
/// read orders by `created_at, id` as the reference does (renderApp `$Ir` /
/// `Zoi`), so their order after a read is not the order they were written in.
fn sorted_members(mut layout: Layout) -> Layout {
    for s in &mut layout.sections {
        s.workspace_ids.sort();
    }
    layout
}

const T1: i64 = 1_793_880_000_000;
const T2: i64 = T1 + 60_000;

#[tokio::test]
async fn write_then_read_round_trips_with_sort_order() {
    let pool = open_in_memory().await.unwrap();
    assert_eq!(
        navigation::read_layout(&pool, &scope("u")).await.unwrap(),
        None
    );
    let mut work = section("s-work", "Work", &["w1", "w2"]);
    work.emoji = Some("🔧".into());
    let layout = Layout {
        sections: vec![work, section("s-later", "Later", &["w3"])],
        updated_at: T1,
    };
    assert!(navigation::write_layout(&pool, &scope("u"), &layout)
        .await
        .unwrap());
    assert_eq!(
        navigation::read_layout(&pool, &scope("u"))
            .await
            .unwrap()
            .map(sorted_members),
        Some(sorted_members(layout))
    );

    let (sections, memberships) = navigation::read(&pool, &scope("u")).await.unwrap();
    assert_eq!(
        sections
            .iter()
            .map(|s| (s.id.as_str(), s.sort_order))
            .collect::<Vec<_>>(),
        [("s-work", 0), ("s-later", 1)]
    );
    assert!(sections
        .iter()
        .all(|s| s.created_at == iso_time::from_millis(T1)));
    assert_eq!(memberships.len(), 3);
    assert!(memberships
        .iter()
        .all(|m| m.id.len() == 36 && &m.id[14..15] == "4"));
    // Another user's sidebar is separate.
    assert_eq!(
        navigation::read_layout(&pool, &scope("v")).await.unwrap(),
        None
    );
}

#[tokio::test]
async fn rewrite_reorders_keeps_ids_and_drops_removed_rows() {
    let pool = open_in_memory().await.unwrap();
    let first = Layout {
        sections: vec![
            section("a", "A", &["w1", "w2"]),
            section("b", "B", &["w3"]),
            section("c", "C", &[]),
        ],
        updated_at: T1,
    };
    navigation::write_layout(&pool, &scope("u"), &first)
        .await
        .unwrap();
    let (_, before) = navigation::read(&pool, &scope("u")).await.unwrap();
    let w1_id = before
        .iter()
        .find(|m| m.workspace_id == "w1")
        .unwrap()
        .id
        .clone();

    // Swap a and b, move w2 out of a, drop c.
    let second = Layout {
        sections: vec![section("b", "B", &["w3"]), section("a", "A", &["w1"])],
        updated_at: T2,
    };
    assert!(navigation::write_layout(&pool, &scope("u"), &second)
        .await
        .unwrap());
    let (sections, memberships) = navigation::read(&pool, &scope("u")).await.unwrap();
    assert_eq!(
        sections.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
        ["b", "a"]
    );
    assert!(sections
        .iter()
        .all(|s| s.created_at == iso_time::from_millis(T1)));
    assert!(sections
        .iter()
        .all(|s| s.updated_at == iso_time::from_millis(T2)));
    let mut ws: Vec<&str> = memberships
        .iter()
        .map(|m| m.workspace_id.as_str())
        .collect();
    ws.sort();
    assert_eq!(ws, ["w1", "w3"]);
    let w1 = memberships.iter().find(|m| m.workspace_id == "w1").unwrap();
    assert_eq!(w1.id, w1_id, "membership id is kept");
    assert_eq!(w1.created_at, iso_time::from_millis(T1));
}

#[tokio::test]
async fn unchanged_section_keeps_updated_at() {
    let pool = open_in_memory().await.unwrap();
    let first = Layout {
        sections: vec![section("a", "A", &["w1"]), section("b", "B", &[])],
        updated_at: T1,
    };
    navigation::write_layout(&pool, &scope("u"), &first)
        .await
        .unwrap();
    let second = Layout {
        sections: vec![section("a", "A", &["w1"]), section("b", "Renamed", &[])],
        updated_at: T2,
    };
    navigation::write_layout(&pool, &scope("u"), &second)
        .await
        .unwrap();
    let (sections, _) = navigation::read(&pool, &scope("u")).await.unwrap();
    assert_eq!(sections[0].updated_at, iso_time::from_millis(T1));
    assert_eq!(sections[1].updated_at, iso_time::from_millis(T2));
    assert_eq!(
        navigation::read_layout(&pool, &scope("u"))
            .await
            .unwrap()
            .unwrap()
            .updated_at,
        T2
    );
}

#[tokio::test]
async fn stale_write_is_skipped() {
    let pool = open_in_memory().await.unwrap();
    let newer = Layout {
        sections: vec![section("a", "New", &[])],
        updated_at: T2,
    };
    navigation::write_layout(&pool, &scope("u"), &newer)
        .await
        .unwrap();
    let older = Layout {
        sections: vec![section("x", "Old", &[])],
        updated_at: T1,
    };
    assert!(!navigation::write_layout(&pool, &scope("u"), &older)
        .await
        .unwrap());
    assert_eq!(
        navigation::read_layout(&pool, &scope("u")).await.unwrap(),
        Some(newer)
    );
}

#[tokio::test]
async fn delete_layout_clears_only_that_scope() {
    let pool = open_in_memory().await.unwrap();
    let layout = Layout {
        sections: vec![section("a", "A", &["w1"])],
        updated_at: T1,
    };
    navigation::write_layout(&pool, &scope("u"), &layout)
        .await
        .unwrap();
    let other = Layout {
        sections: vec![section("z", "Z", &["w9"])],
        updated_at: T1,
    };
    navigation::write_layout(&pool, &scope("v"), &other)
        .await
        .unwrap();
    navigation::delete_layout(&pool, &scope("u")).await.unwrap();
    assert_eq!(
        navigation::read_layout(&pool, &scope("u")).await.unwrap(),
        None
    );
    assert_eq!(
        navigation::read_layout(&pool, &scope("v")).await.unwrap(),
        Some(other)
    );
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM navigation_section_memberships")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
}

#[tokio::test]
async fn members_written_together_read_back_by_id() {
    let pool = open_in_memory().await.unwrap();
    let layout = Layout {
        sections: vec![section("a", "A", &["w1", "w2", "w3"])],
        updated_at: T1,
    };
    navigation::write_layout(&pool, &scope("u"), &layout)
        .await
        .unwrap();
    let (_, memberships) = navigation::read(&pool, &scope("u")).await.unwrap();
    assert!(memberships
        .iter()
        .all(|m| m.created_at == iso_time::from_millis(T1)));
    let ids: Vec<&str> = memberships.iter().map(|m| m.id.as_str()).collect();
    let mut by_id = ids.clone();
    by_id.sort();
    assert_eq!(ids, by_id, "a created_at tie is broken by id");
}
