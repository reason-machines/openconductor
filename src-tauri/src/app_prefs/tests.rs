use std::collections::HashMap;

use super::*;

fn rows(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

#[test]
fn defaults_match_the_reference_hooks() {
    let p = AppPrefs::from_rows(&HashMap::new());
    assert!(!p.garry_mode);
    assert!(!p.experimental_show_agent_cost);
    assert!(!p.experimental_tab_freak_mode);
    assert!(
        !p.graphite_disabled,
        "unset graphite_disabled reads as enabled"
    );
    assert!(p.left_panel_visible && p.right_panel_visible);
    assert_eq!(p.left_panel_width, 256);
    assert_eq!((p.onboarding_step, p.first_time_onboarding_step), (0, 1));
    assert_eq!(p.default_open_in, None);
    assert!(p.open_in_mru_order.is_empty());
    assert_eq!(p.last_clone_directory, None);
}

#[test]
fn stored_text_decodes_like_the_reference() {
    let p = AppPrefs::from_rows(&rows(&[
        ("garry_mode", "true"),
        ("graphite_disabled", "true"),
        ("left_panel_visible", "false"),
        ("right_panel_visible", "false"),
        ("left_panel_width", "301"),
        ("onboarding_step", "999"),
        ("first_time_onboarding_step", "3"),
        ("last_clone_directory", "/Users/me/code"),
    ]));
    assert!(p.garry_mode && p.graphite_disabled);
    assert!(!p.left_panel_visible && !p.right_panel_visible);
    assert_eq!(p.left_panel_width, 301);
    assert_eq!((p.onboarding_step, p.first_time_onboarding_step), (999, 3));
    assert_eq!(p.last_clone_directory.as_deref(), Some("/Users/me/code"));
}

#[test]
fn bad_values_fall_back_to_defaults() {
    let p = AppPrefs::from_rows(&rows(&[
        ("left_panel_width", "wide"),
        ("garry_mode", "yes"),
        ("graphite_disabled", "TRUE"),
        ("open_in_mru_order", "{not json"),
    ]));
    assert_eq!(p.left_panel_width, 256);
    assert!(!p.garry_mode && !p.graphite_disabled);
    assert!(p.open_in_mru_order.is_empty());
    // parseInt reads the leading integer.
    let p = AppPrefs::from_rows(&rows(&[("left_panel_width", "280px")]));
    assert_eq!(p.left_panel_width, 280);
}

#[test]
fn updates_encode_as_text() {
    let set = |u: AppPrefUpdate| u.encode().unwrap();
    assert_eq!(
        set(AppPrefUpdate::GarryMode(true)),
        Write::Set("garry_mode", "true".into())
    );
    assert_eq!(
        set(AppPrefUpdate::LeftPanelWidth(287.6)),
        Write::Set("left_panel_width", "288".into())
    );
    assert_eq!(
        set(AppPrefUpdate::RoundhouseClientUserId(None)),
        Write::Delete("roundhouse_client_user_id")
    );
    assert!(AppPrefUpdate::LeftPanelWidth(f64::NAN).encode().is_err());
    assert!(AppPrefUpdate::LastCloneDirectory("  ".into())
        .encode()
        .is_err());
}

#[test]
fn updates_parse_from_ipc_json() {
    let u: AppPrefUpdate =
        serde_json::from_str(r#"{"key":"experimental_tab_freak_mode","value":true}"#).unwrap();
    assert_eq!(u, AppPrefUpdate::ExperimentalTabFreakMode(true));
    assert!(
        serde_json::from_str::<AppPrefUpdate>(r#"{"key":"left_panel_width","value":"x"}"#).is_err()
    );
    assert!(
        serde_json::from_str::<AppPrefUpdate>(r#"{"key":"garry_mode","value":"true"}"#).is_err()
    );
    assert!(serde_json::from_str::<AppPrefUpdate>(r#"{"key":"zoom","value":1}"#).is_err());
}

#[test]
fn open_in_moves_the_app_to_the_front() {
    let before = rows(&[(
        "open_in_mru_order",
        r#"["vscode|local","cursor|local","finder"]"#,
    )]);
    let [default, order] = record_open_in(&before, "cursor", Some(false));
    assert_eq!(default, Write::Set("default_open_in", "cursor".into()));
    assert_eq!(
        order,
        Write::Set(
            "open_in_mru_order",
            r#"["cursor|local","vscode|local","finder"]"#.into()
        )
    );
    // Without a location the bare id goes first and replaces a bare entry.
    let [_, order] = record_open_in(&before, "finder", None);
    assert_eq!(
        order,
        Write::Set(
            "open_in_mru_order",
            r#"["finder","vscode|local","cursor|local"]"#.into()
        )
    );
    let p = AppPrefs::from_rows(&rows(&[
        ("default_open_in", "finder"),
        ("open_in_mru_order", r#"["zed|remote"]"#),
    ]));
    assert_eq!(p.default_open_in.as_deref(), Some("zed"));
}

#[test]
fn prefs_round_trip_through_the_table() {
    tauri::async_runtime::block_on(async {
        let pool = openconductor_db::open_in_memory().await.unwrap();
        for u in [
            AppPrefUpdate::GarryMode(true),
            AppPrefUpdate::LeftPanelWidth(320.0),
            AppPrefUpdate::LastCloneDirectory("/tmp/code".into()),
        ] {
            match u.encode().unwrap() {
                Write::Set(k, v) => openconductor_db::app_settings::set(&pool, k, &v)
                    .await
                    .unwrap(),
                Write::Delete(k) => openconductor_db::app_settings::delete(&pool, k)
                    .await
                    .unwrap(),
            }
        }
        let p = commands::load(&pool).await.unwrap();
        assert!(p.garry_mode);
        assert_eq!(p.left_panel_width, 320);
        assert_eq!(p.last_clone_directory.as_deref(), Some("/tmp/code"));
        let id = commands::client_instance_id_for(&pool).await.unwrap();
        assert_eq!(id.len(), 36);
        assert_eq!(commands::client_instance_id_for(&pool).await.unwrap(), id);
    });
}

#[test]
fn graphite_cli_is_found_on_path() {
    let dir = std::env::temp_dir().join(format!("oc-gt-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = std::env::join_paths([dir.clone()]).unwrap();
    let before = commands::graphite_cli_on(Some(&path));
    std::fs::write(dir.join("gt"), "").unwrap();
    assert!(commands::graphite_cli_on(Some(&path)));
    std::fs::remove_dir_all(&dir).unwrap();
    // Missing unless a system location has it.
    assert_eq!(
        before,
        std::path::Path::new("/opt/homebrew/bin/gt").is_file()
            || std::path::Path::new("/usr/local/bin/gt").is_file()
    );
}

#[test]
fn sidebar_repo_filter_is_a_raw_id_and_all_projects_deletes_it() {
    // `z6t` (index-BGEQ8YjU.js @420,066): updateSetting with the id, or
    // deleteSetting when the filter is cleared.
    assert_eq!(
        AppPrefUpdate::SidebarRepoFilter(Some("repo-1".into()))
            .encode()
            .unwrap(),
        Write::Set("sidebar_repo_filter", "repo-1".into())
    );
    assert_eq!(
        AppPrefUpdate::SidebarRepoFilter(None).encode().unwrap(),
        Write::Delete("sidebar_repo_filter")
    );
    assert!(AppPrefUpdate::SidebarRepoFilter(Some(" ".into()))
        .encode()
        .is_err());
    let u: AppPrefUpdate =
        serde_json::from_str(r#"{"key":"sidebar_repo_filter","value":null}"#).unwrap();
    assert_eq!(u, AppPrefUpdate::SidebarRepoFilter(None));
    assert_eq!(
        AppPrefs::from_rows(&HashMap::new()).sidebar_repo_filter,
        None
    );

    tauri::async_runtime::block_on(async {
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let write = |u: AppPrefUpdate| {
            let pool = pool.clone();
            async move {
                match u.encode().unwrap() {
                    Write::Set(k, v) => openconductor_db::app_settings::set(&pool, k, &v)
                        .await
                        .unwrap(),
                    Write::Delete(k) => openconductor_db::app_settings::delete(&pool, k)
                        .await
                        .unwrap(),
                }
            }
        };
        write(AppPrefUpdate::SidebarRepoFilter(Some("repo-1".into()))).await;
        let p = commands::load(&pool).await.unwrap();
        assert_eq!(p.sidebar_repo_filter.as_deref(), Some("repo-1"));
        write(AppPrefUpdate::SidebarRepoFilter(None)).await;
        let p = commands::load(&pool).await.unwrap();
        assert_eq!(p.sidebar_repo_filter, None);
    });
}

#[test]
fn sidebar_resource_usage_is_an_off_by_default_flag() {
    // `Te("sidebar_resource_usage", !1)` and setter `v6t` (index-BGEQ8YjU.js):
    // a boolean written as "true" / "false", false when unset.
    assert!(!AppPrefs::from_rows(&HashMap::new()).sidebar_resource_usage);
    assert!(
        AppPrefs::from_rows(&rows(&[("sidebar_resource_usage", "true")])).sidebar_resource_usage
    );
    assert!(
        !AppPrefs::from_rows(&rows(&[("sidebar_resource_usage", "yes")])).sidebar_resource_usage
    );
    let u: AppPrefUpdate =
        serde_json::from_str(r#"{"key":"sidebar_resource_usage","value":true}"#).unwrap();
    assert_eq!(
        u.encode().unwrap(),
        Write::Set("sidebar_resource_usage", "true".into())
    );
    assert_eq!(
        AppPrefUpdate::SidebarResourceUsage(false).encode().unwrap(),
        Write::Set("sidebar_resource_usage", "false".into())
    );
}

#[test]
fn dashboard_enabled_is_off_unless_the_row_says_true() {
    // `mzt` (index-BGEQ8YjU.js @407,016) reads `data === "true"`; `eGt`
    // (@421,195) writes `value.toString()`; `_z` defaults it to "false".
    assert!(!AppPrefs::from_rows(&HashMap::new()).dashboard_enabled);
    assert!(!AppPrefs::from_rows(&rows(&[("dashboard_enabled", "TRUE")])).dashboard_enabled);
    assert!(AppPrefs::from_rows(&rows(&[("dashboard_enabled", "true")])).dashboard_enabled);
    let u: AppPrefUpdate =
        serde_json::from_str(r#"{"key":"dashboard_enabled","value":true}"#).unwrap();
    assert_eq!(u, AppPrefUpdate::DashboardEnabled(true));
    assert_eq!(
        u.encode().unwrap(),
        Write::Set("dashboard_enabled", "true".into())
    );
    assert_eq!(
        AppPrefUpdate::DashboardEnabled(false).encode().unwrap(),
        Write::Set("dashboard_enabled", "false".into())
    );

    tauri::async_runtime::block_on(async {
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let Write::Set(k, v) = AppPrefUpdate::DashboardEnabled(true).encode().unwrap() else {
            unreachable!()
        };
        openconductor_db::app_settings::set(&pool, k, &v).await.unwrap();
        assert!(commands::load(&pool).await.unwrap().dashboard_enabled);
    });
}
