use super::*;

fn layer(layer: Layer, text: &str) -> LayerSource {
    LayerSource::from_toml(layer, format!("{layer:?}.toml"), text).unwrap()
}

#[test]
fn ids_and_labels_normalize_like_the_reference() {
    assert_eq!(
        normalize_id("  Dev  Server!").as_deref(),
        Some("Dev-Server")
    );
    assert_eq!(normalize_id("test--watch").as_deref(), Some("test-watch"));
    assert_eq!(normalize_id("--- !!"), None);
    assert_eq!(label_for("dev-server"), "Dev server");
}

#[test]
fn entries_parse_with_defaults() {
    let r = resolve(&[layer(
        Layer::RepoShared,
        r#"
[scripts.run.dev]
command = "pnpm dev --port $CONDUCTOR_PORT"
available_in = ["local"]
default = true
icon = "play"

[scripts.run.test]
command = "pnpm test"
args = ["--filter", "it's"]
options = { cwd = "apps/$SUB" }
icon = "Not An Icon"
hide = true
"#,
    )]);
    assert!(r.warnings.is_empty(), "{:?}", r.warnings);
    let [dev, test] = &r.run[..] else {
        panic!("{:?}", r.run)
    };
    assert_eq!(dev.available_in, [Location::Local].into());
    assert!(dev.default && !dev.hide);
    assert_eq!(test.available_in, [Location::Local, Location::Cloud].into());
    assert_eq!(test.icon, DEFAULT_ICON);
    assert_eq!(test.cwd.as_deref(), Some("apps/$SUB"));
    assert!(test.hide && !test.default);
    assert_eq!(test.command_line(), r"pnpm test '--filter' 'it'\''s'");
    assert_eq!(
        default_script(&r.run, Location::Cloud).map(|s| s.id.as_str()),
        Some("test")
    );
    assert_eq!(
        default_script(&r.run, Location::Local).map(|s| s.id.as_str()),
        Some("dev")
    );
}

#[test]
fn same_id_merges_across_layers_case_insensitively() {
    let r = resolve(&[
        layer(
            Layer::RepoShared,
            "[scripts.run.Dev]\ncommand = \"npm run dev\"\nicon = \"rocket\"\n",
        ),
        layer(Layer::RepoLocal, "[scripts.run.dev]\nargs = [\"--open\"]\n"),
    ]);
    let [dev] = &r.run[..] else {
        panic!("{:?}", r.run)
    };
    assert_eq!((dev.id.as_str(), dev.icon.as_str()), ("dev", "rocket"));
    assert_eq!(dev.command_line(), "npm run dev '--open'");
    assert_eq!(dev.layer, Layer::RepoLocal);
}

#[test]
fn legacy_string_and_tasks_alias() {
    let r = resolve(&[layer(
        Layer::RepoShared,
        "[tasks.lint]\ncommand = \"npm run lint\"\n\n[scripts]\nrun = \"npm start\"\n",
    )]);
    let ids: Vec<_> = r.run.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["run", "lint"]);
    let legacy = &r.run[0];
    assert!(legacy.default);
    assert_eq!(legacy.icon, "play");
    assert_eq!(legacy.available_in, [Location::Local].into());
}

#[test]
fn bad_entries_are_skipped_with_warnings() {
    let r = resolve(&[layer(
        Layer::User,
        r#"
[scripts.run.nocmd]
icon = "play"
[scripts.run.badargs]
command = "x"
args = "oops"
[scripts.run.badloc]
command = "x"
available_in = ["mars"]
[scripts.run.extra]
command = "x"
colour = "red"
"#,
    )]);
    let ids: Vec<_> = r.run.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["extra"]);
    assert_eq!(r.warnings.len(), 3, "{:?}", r.warnings);
}
