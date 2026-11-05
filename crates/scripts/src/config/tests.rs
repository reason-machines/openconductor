use super::*;

fn toml(layer: Layer, text: &str) -> LayerSource {
    LayerSource::from_toml(layer, format!("{layer:?}.toml"), text).unwrap()
}

#[test]
fn higher_layers_win_and_tables_merge() {
    let r = resolve(&[
        toml(Layer::Managed, "[scripts]\narchive = \"managed\"\n"),
        toml(
            Layer::User,
            "[scripts]\nsetup = \"user\"\nrun_mode = \"nonconcurrent\"\n",
        ),
        toml(Layer::RepoShared, "[scripts]\nsetup = \"shared\"\n"),
        toml(
            Layer::RepoLocal,
            "[scripts]\nsetup = \"local\"\nauto_run_after_setup = true\n",
        ),
    ]);
    assert_eq!(
        r.setup,
        Some(Sourced {
            value: "local".into(),
            layer: Layer::RepoLocal
        })
    );
    assert_eq!(r.archive.as_ref().map(|s| s.layer), Some(Layer::Managed));
    assert_eq!(r.run_mode, RunMode::Nonconcurrent);
    assert!(r.auto_run_after_setup);
    assert!(
        r.is_managed("scripts.archive")
            && r.is_managed("scripts")
            && !r.is_managed("scripts.setup")
    );
}

#[test]
fn any_toml_outranks_any_json() {
    let json = LayerSource::from_json(Layer::Managed, "m.json", r#"{"scripts":{"setup":"json"}}"#)
        .unwrap();
    let r = resolve(&[json, toml(Layer::User, "[scripts]\nsetup = \"toml\"\n")]);
    assert_eq!(r.setup.unwrap().value, "toml");
}

#[test]
fn conductor_json_maps_legacy_keys() {
    let l = LayerSource::from_conductor_json(
        Layer::RepoShared,
        "conductor.json",
        r#"{"scripts":{"setup":"npm i","run":"npm run dev","archive":"rm -rf tmp"},
            "runScriptMode":"nonconcurrent","enterpriseDataPrivacy":"true"}"#,
    )
    .unwrap();
    assert_eq!(l.format, Format::Json);
    assert_eq!(l.table["enterprise_data_privacy"], Value::Boolean(true));
    let r = resolve(&[l]);
    assert_eq!(r.setup.unwrap().value, "npm i");
    assert_eq!(r.archive.unwrap().value, "rm -rf tmp");
    assert_eq!(r.run, Some(Value::String("npm run dev".into())));
    assert_eq!(r.run_mode, RunMode::Nonconcurrent);
}

#[test]
fn bad_values_are_dropped_with_a_warning() {
    let r = resolve(&[toml(
        Layer::User,
        "[scripts]\nsetup = 3\narchive = \"  \"\nrun_mode = \"sometimes\"\nauto_run_after_setup = \"yes\"\n",
    )]);
    assert_eq!(
        (r.setup, r.archive, r.run_mode),
        (None, None, RunMode::Concurrent)
    );
    assert_eq!(r.warnings.len(), 3, "{:?}", r.warnings);
}

#[test]
fn parse_errors_name_the_file() {
    let err = LayerSource::from_toml(Layer::User, "u.toml", "[scripts").unwrap_err();
    assert!(err.to_string().contains("u.toml"), "{err}");
}
