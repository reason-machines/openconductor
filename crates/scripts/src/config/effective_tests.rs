use std::fs;
use std::path::{Path, PathBuf};

use super::*;

fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

struct Fixture {
    _tmp: tempfile::TempDir,
    user: PathBuf,
    home: PathBuf,
    root: PathBuf,
    ws: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().to_path_buf();
        Self {
            user: p.join("home/.openconductor"),
            home: p.join("home"),
            root: p.join("root"),
            ws: p.join("ws"),
            _tmp: tmp,
        }
    }

    fn paths(&self) -> EffectivePaths {
        EffectivePaths {
            user_dir: self.user.clone(),
            home: self.home.clone(),
            repo_root: self.root.clone(),
            workspace: Some(self.ws.clone()),
        }
    }

    fn load(&self) -> EffectiveSettings {
        load_effective(&self.paths()).unwrap()
    }
}

#[test]
fn defaults_without_any_file() {
    let f = Fixture::new();
    let e = f.load();
    assert_eq!(e.prompts, Prompts::default());
    assert!(!e.git.archive_on_merge.value && !e.git.delete_branch_on_archive.value);
    assert!(e.git.worktree_push_auto_setup_remote.value);
    assert_eq!(e.git.worktree_push_auto_setup_remote.layer, Layer::Defaults);
    assert_eq!((e.preview_urls, e.env), (None, ResolvedEnv::default()));
}

#[test]
fn prompts_replace_by_layer_and_blank_is_unset() {
    let f = Fixture::new();
    write(
        &f.user.join("settings.toml"),
        "[prompts]\ngeneral = \"user general\"\ncode_review = \"user review\"\ncreate_pr = \"user pr\"\n",
    );
    write(
        &f.root.join(".conductor/settings.toml"),
        "[prompts]\ncode_review = \"shared review\"\nfix_errors = \"shared fix\"\n",
    );
    write(
        &f.ws.join(".conductor/settings.toml"),
        "[prompts]\nfix_errors = \"workspace fix\"\n",
    );
    write(
        &f.root.join(".conductor/settings.local.toml"),
        "[prompts]\ncreate_pr = \"  \"\nrename_branch = \"local rename\"\nresolve_merge_conflicts = \"local conflicts\"\n",
    );
    let e = f.load();
    let p = &e.prompts;
    assert_eq!(p.get(PromptKind::General), Some("user general"));
    assert_eq!(p.general.as_ref().unwrap().layer, Layer::User);
    assert_eq!(p.get(PromptKind::CodeReview), Some("shared review"));
    assert_eq!(
        p.get(PromptKind::FixErrors),
        Some("workspace fix"),
        "the workspace's own settings.toml outranks the root's"
    );
    assert_eq!(
        p.get(PromptKind::CreatePr),
        None,
        "a blank higher value hides the user's"
    );
    assert_eq!(p.get(PromptKind::RenameBranch), Some("local rename"));
    assert_eq!(
        p.resolve_merge_conflicts.as_ref().unwrap().layer,
        Layer::RepoLocal
    );
    assert!(e.warnings.is_empty(), "{:?}", e.warnings);
}

#[test]
fn git_flags_and_branch_prefix_alias() {
    let f = Fixture::new();
    write(
        &f.user.join("settings.toml"),
        "[git]\nbranch_prefix_type = \"custom\"\nbranch_prefix_custom = \"old/\"\narchive_on_merge = true\n",
    );
    let e = f.load();
    assert_eq!(
        e.git.branch_prefix.as_ref().unwrap().value,
        "old/",
        "old name is an alias"
    );
    assert_eq!(e.git.branch_prefix_type.unwrap().value, "custom");
    assert!(e.git.archive_on_merge.value);

    write(
        &f.root.join(".conductor/settings.local.toml"),
        "[git]\nbranch_prefix = \"repo-\"\narchive_on_merge = \"false\"\ndelete_branch_on_archive = true\nworktree_push_auto_setup_remote = false\n",
    );
    let e = f.load();
    assert_eq!(
        e.git.branch_prefix.unwrap(),
        Sourced {
            value: "repo-".into(),
            layer: Layer::RepoLocal
        }
    );
    assert_eq!(
        e.git.archive_on_merge,
        Sourced {
            value: false,
            layer: Layer::RepoLocal
        }
    );
    assert!(e.git.delete_branch_on_archive.value);
    assert!(!e.git.worktree_push_auto_setup_remote.value);

    write(
        &f.root.join(".conductor/settings.local.toml"),
        "[git]\narchive_on_merge = 1\n",
    );
    let e = f.load();
    assert!(
        e.git.archive_on_merge.value,
        "a bad value keeps the lower layer's"
    );
    assert_eq!(e.warnings.len(), 1, "{:?}", e.warnings);
}

#[test]
fn branch_prefix_prefers_new_name_within_a_layer() {
    let f = Fixture::new();
    write(
        &f.user.join("settings.toml"),
        "[git]\nbranch_prefix = \"new/\"\nbranch_prefix_custom = \"old/\"\n",
    );
    assert_eq!(f.load().git.branch_prefix.unwrap().value, "new/");
}

#[test]
fn preview_urls_parse_tables_and_legacy_strings() {
    let mut w = Vec::new();
    let v: Value = "x = [{ name = \"App\", url = \"http://localhost:$CONDUCTOR_PORT\" }, { url = \"http://b\" }, { url = \"c\", extra = 1 }, 3]"
        .parse::<Table>()
        .unwrap()["x"]
        .clone();
    let urls = parse_preview_urls(&v, &mut w).unwrap();
    assert_eq!(
        urls,
        vec![
            PreviewUrl {
                name: Some("App".into()),
                url: "http://localhost:$CONDUCTOR_PORT".into()
            },
            PreviewUrl {
                name: None,
                url: "http://b".into()
            },
        ]
    );
    assert_eq!(w.len(), 2, "{w:?}");
    let json = Value::String(r#"[{"name":"a","url":"http://a"}]"#.into());
    assert_eq!(
        parse_preview_urls(&json, &mut w).unwrap()[0]
            .name
            .as_deref(),
        Some("a")
    );
    let one = Value::String("http://one".into());
    assert_eq!(
        parse_preview_urls(&one, &mut w).unwrap()[0].url,
        "http://one"
    );

    let f = Fixture::new();
    write(
        &f.user.join("settings.toml"),
        "preview_urls = [{ url = \"http://user\" }]\n",
    );
    write(
        &f.root.join(".conductor/settings.local.toml"),
        "preview_urls = [{ url = \"http://local\" }]\n",
    );
    let e = f.load();
    let p = e.preview_urls.unwrap();
    assert_eq!(
        (p.value[0].url.as_str(), p.layer),
        ("http://local", Layer::RepoLocal)
    );
}

#[test]
fn file_include_globs_is_a_string_the_repository_local_file_overrides() {
    let f = Fixture::new();
    write(
        &f.user.join("settings.toml"),
        "file_include_globs = \".env*\"\n",
    );
    write(
        &f.root.join(".conductor/settings.local.toml"),
        "file_include_globs = \".env\\n*.local\\n!.keep.local\"\n",
    );
    let g = f.load().file_include_globs.unwrap();
    assert_eq!(
        (g.value.as_str(), g.layer),
        (".env\n*.local\n!.keep.local", Layer::RepoLocal)
    );
    assert!(is_local_writable(&["file_include_globs"]));
}

#[test]
fn dotenv_parsing_matches_the_reference_rules() {
    let vars = parse_dotenv(
        "# comment\n\nexport A=1\nB = two words # trailing\nC=\"x\\ny\\tz\\\"q\"\nD='raw\\n'\n1BAD=no\n=empty\nE=a#b\nF=\n",
    );
    assert_eq!(vars["A"], "1");
    assert_eq!(vars["B"], "two words");
    assert_eq!(vars["C"], "x\ny\tz\"q");
    assert_eq!(vars["D"], "raw\\n");
    assert_eq!(
        vars["E"], "a#b",
        "only a # after whitespace starts a comment"
    );
    assert_eq!(vars["F"], "");
    assert!(!vars.contains_key("1BAD") && vars.len() == 6, "{vars:?}");
}

#[test]
fn env_files_then_tables_layer_by_layer() {
    let f = Fixture::new();
    write(
        &f.home.join(".env.user"),
        "SHARED=from-user-file\nUSER_ONLY=u\n",
    );
    write(
        &f.root.join(".conductor/repo.env"),
        "SHARED=from-repo-file\nFILE_ONLY=f\n",
    );
    write(&f.root.join("root.env"), "ROOT_FALLBACK=r\n");
    write(
        &f.user.join("settings.toml"),
        "environment_variable_files = [\"~/.env.user\"]\n[environment_variables]\nIGNORED_AT_USER = \"x\"\n",
    );
    write(
        &f.root.join(".conductor/settings.toml"),
        "environment_variable_files = [\"repo.env\", \"root.env\", \"missing.env\"]\n\
         [environment_variables]\nBOTH = \"b\"\nUSER_ONLY = \"<none>\"\n\
         [environment_variables.local]\nFILE_ONLY = \"table-wins\"\nLOCAL = \"l\"\n\
         [environment_variables.cloud]\nCLOUD = \"c\"\nSECRET = \"conductor-keychain\"\n",
    );
    write(
        &f.root.join(".conductor/settings.local.toml"),
        "[environment_variables.local]\nLOCAL = \"overridden\"\nBOTH = \"<none>\"\n",
    );
    let e = f.load();
    let local = e.env.vars(EnvContext::Local);
    let cloud = e.env.vars(EnvContext::Cloud);
    assert_eq!(local["SHARED"], "from-repo-file");
    assert_eq!(local["FILE_ONLY"], "table-wins");
    assert_eq!(cloud["FILE_ONLY"], "f", "a .local entry leaves cloud alone");
    assert_eq!(
        local["ROOT_FALLBACK"], "r",
        "relative path falls back to the repository root"
    );
    assert!(
        !local.contains_key("USER_ONLY") && !cloud.contains_key("USER_ONLY"),
        "<none> unsets both"
    );
    assert!(
        !local.contains_key("IGNORED_AT_USER"),
        "user layer's table does not apply"
    );
    assert_eq!(local["LOCAL"], "overridden");
    assert!(!local.contains_key("BOTH") && cloud["BOTH"] == "b");
    assert!(!local.contains_key("CLOUD") && cloud["CLOUD"] == "c");
    assert!(!cloud.contains_key("SECRET"));
    assert!(
        e.warnings.iter().any(|w| w.contains("SECRET")),
        "{:?}",
        e.warnings
    );
    assert_eq!(e.env.local["FILE_ONLY"].source.layer, Layer::RepoShared);
    assert_eq!(
        e.env.local["SHARED"].source.env_file.as_deref(),
        Some(
            f.root
                .join(".conductor/repo.env")
                .display()
                .to_string()
                .as_str()
        )
    );
    let loaded: Vec<_> = e
        .env
        .files
        .iter()
        .map(|s| (s.entry.as_str(), s.loaded))
        .collect();
    assert_eq!(
        loaded,
        vec![
            ("~/.env.user", Some(2)),
            ("repo.env", Some(2)),
            ("root.env", Some(1)),
            ("missing.env", None)
        ]
    );
    let files = e.environment_variable_files.unwrap();
    assert_eq!((files.value.len(), files.layer), (3, Layer::RepoShared));
}

#[test]
fn managed_env_applies_last_and_only_per_context() {
    let f = Fixture::new();
    write(
        &f.root.join(".conductor/settings.local.toml"),
        "[environment_variables.local]\nA = \"repo\"\n",
    );
    write(
        &f.user.join("settings.managed.toml"),
        "[environment_variables]\nTOP = \"ignored\"\n[environment_variables.local]\nA = \"managed\"\n",
    );
    let local = f.load().env.vars(EnvContext::Local);
    assert_eq!(local["A"], "managed");
    assert!(!local.contains_key("TOP"));
}

#[test]
fn json_repo_layers_rank_below_toml() {
    let f = Fixture::new();
    write(
        &f.root.join(".conductor/settings.local.json"),
        r#"{"prompts":{"general":"json"},"environment_variables":{"local":{"X":"json"}}}"#,
    );
    write(
        &f.user.join("settings.toml"),
        "[prompts]\ngeneral = \"toml\"\n",
    );
    let e = f.load();
    assert_eq!(e.prompts.get(PromptKind::General), Some("toml"));
    assert_eq!(e.env.vars(EnvContext::Local)["X"], "json");
}

#[test]
fn env_file_paths_resolve_like_the_reference() {
    let tmp = tempfile::tempdir().unwrap();
    let (dir, root, home) = (
        tmp.path().join("d"),
        tmp.path().join("r"),
        tmp.path().join("h"),
    );
    write(&dir.join("near.env"), "");
    assert_eq!(
        resolve_env_file("/abs/../x.env", &dir, &root, &home),
        PathBuf::from("/x.env")
    );
    assert_eq!(resolve_env_file("~", &dir, &root, &home), home);
    assert_eq!(
        resolve_env_file("~/a/.env", &dir, &root, &home),
        home.join("a/.env")
    );
    assert_eq!(
        resolve_env_file("./near.env", &dir, &root, &home),
        dir.join("near.env")
    );
    assert_eq!(
        resolve_env_file("../far.env", &dir, &root, &home),
        tmp.path().join("far.env")
    );
    assert_eq!(
        env_file_entries(&Value::String(" a\n\n b \n".into())),
        vec!["a", "b"]
    );
    assert!(env_file_entries(&Value::Array(vec![Value::Integer(1)])).is_empty());
}

#[test]
fn prompt_kinds_round_trip_their_keys() {
    for k in PromptKind::ALL {
        assert_eq!(PromptKind::parse(k.key()), Some(k));
    }
    assert_eq!(PromptKind::parse("nope"), None);
}

#[test]
fn local_writes_set_and_remove_only_known_keys() {
    let f = Fixture::new();
    let local = f.root.join(".conductor/settings.local.toml");
    write(&local, "[scripts]\nsetup = \"keep\"\n");
    set_local_value(
        &f.root,
        &["prompts", "code_review"],
        Some(Value::String("Be strict.".into())),
    )
    .unwrap();
    set_local_value(
        &f.root,
        &["environment_variables", "local", "API_URL"],
        Some(Value::String("http://x".into())),
    )
    .unwrap();
    set_local_value(
        &f.root,
        &["git", "archive_on_merge"],
        Some(Value::Boolean(true)),
    )
    .unwrap();
    let e = f.load();
    assert_eq!(e.prompts.get(PromptKind::CodeReview), Some("Be strict."));
    assert_eq!(e.env.vars(EnvContext::Local)["API_URL"], "http://x");
    assert_eq!(
        e.git.archive_on_merge,
        Sourced {
            value: true,
            layer: Layer::RepoLocal
        }
    );

    set_local_value(
        &f.root,
        &["environment_variables", "local", "API_URL"],
        None,
    )
    .unwrap();
    set_local_value(&f.root, &["prompts", "code_review"], None).unwrap();
    let text = fs::read_to_string(&local).unwrap();
    assert!(
        !text.contains("environment_variables") && !text.contains("prompts"),
        "{text}"
    );
    assert!(
        text.contains("setup = \"keep\"") && text.contains("archive_on_merge = true"),
        "{text}"
    );

    for bad in [
        &["scripts", "setup"][..],
        &["scripts", "run", "dev"],
        &["scripts", "run", "Dev Server"],
        &["scripts", "run_mode"],
        &["prompts", "other"],
        &["environment_variables", "local", "1X"],
    ] {
        assert!(
            set_local_value(&f.root, bad, Some(Value::Boolean(true))).is_err(),
            "{bad:?}"
        );
    }
}

#[test]
fn local_writes_edit_the_repository_scripts() {
    let f = Fixture::new();
    let paths = || super::SettingsPaths {
        user_dir: f.root.join("home/.conductor"),
        repo_root: f.root.clone(),
        workspace: None,
        shared_from: super::SharedSource::WorkingTree,
    };
    let local = f.root.join(".conductor/settings.local.toml");
    write(&local, "[scripts]\nrun = \"npm start\"\n");
    set_local_value(
        &f.root,
        &["scripts", "setup"],
        Some(Value::String("npm install".into())),
    )
    .unwrap();
    let mut entry = Table::new();
    entry.insert("command".into(), Value::String("npm test".into()));
    entry.insert("icon".into(), Value::String("flask-conical".into()));
    set_local_value(
        &f.root,
        &["scripts", "run", "unit-tests"],
        Some(Value::Table(entry)),
    )
    .unwrap();
    let r = super::load(&paths()).unwrap();
    assert_eq!(
        r.setup.as_ref().map(|s| s.value.as_str()),
        Some("npm install")
    );
    let ids: Vec<_> = r
        .run
        .iter()
        .map(|s| (s.id.as_str(), s.command.as_str(), s.default))
        .collect();
    // The legacy string survives as entry `run`, still the default.
    assert_eq!(
        ids,
        [
            ("run", "npm start", true),
            ("unit-tests", "npm test", false)
        ]
    );
    assert_eq!(r.run[1].icon, "flask-conical");

    set_local_value(&f.root, &["scripts", "run", "unit-tests"], None).unwrap();
    set_local_value(&f.root, &["scripts", "setup"], None).unwrap();
    let r = super::load(&paths()).unwrap();
    assert!(r.setup.is_none());
    assert_eq!(r.run.len(), 1);
}

#[test]
fn stored_variables_replace_user_file_values_but_not_repository_ones() {
    let f = Fixture::new();
    write(
        &f.home.join(".env.user"),
        "FROM_USER_FILE=file\nUNTOUCHED=keep\n",
    );
    write(
        &f.user.join("settings.toml"),
        "environment_variable_files = [\"~/.env.user\"]\n",
    );
    write(
        &f.root.join(".conductor/settings.toml"),
        "[environment_variables]\nREPO_PINNED = \"repo\"\n",
    );
    let e = f.load();
    let stored = [
        ("FROM_USER_FILE", "stored"),
        ("REPO_PINNED", "stored"),
        ("ONLY_STORED", "s"),
    ];
    let vars = e.env.vars_with_stored(EnvContext::Local, stored);
    assert_eq!(vars["FROM_USER_FILE"], "stored");
    assert_eq!(vars["REPO_PINNED"], "repo");
    assert_eq!(vars["ONLY_STORED"], "s");
    assert_eq!(vars["UNTOUCHED"], "keep");
}

#[test]
fn a_repository_unset_also_hides_a_stored_variable() {
    let f = Fixture::new();
    write(
        &f.root.join(".conductor/settings.local.toml"),
        "[environment_variables]\nSTORED = \"<none>\"\n",
    );
    let e = f.load();
    assert_eq!(e.env.unset.local.get("STORED"), Some(&Layer::RepoLocal));
    let vars = e
        .env
        .vars_with_stored(EnvContext::Local, [("STORED", "s"), ("OTHER", "o")]);
    assert!(!vars.contains_key("STORED"), "{vars:?}");
    assert_eq!(vars["OTHER"], "o");
}

#[test]
fn a_later_layer_setting_a_variable_clears_its_unset() {
    let f = Fixture::new();
    write(
        &f.root.join(".conductor/settings.toml"),
        "[environment_variables]\nX = \"<none>\"\n",
    );
    write(
        &f.root.join(".conductor/settings.local.toml"),
        "[environment_variables]\nX = \"local\"\n",
    );
    let e = f.load();
    assert!(e.env.unset.local.is_empty());
    assert_eq!(e.env.local["X"].value, "local");
}

#[test]
fn user_env_keeps_the_users_value_a_repository_overrides() {
    let f = Fixture::new();
    write(&f.home.join(".env.user"), "API_URL=mine\nONLY_USER=u\n");
    write(
        &f.user.join("settings.toml"),
        "environment_variable_files = [\"~/.env.user\"]\n",
    );
    write(
        &f.root.join(".conductor/settings.local.toml"),
        "[environment_variables]\nAPI_URL = \"repo\"\n",
    );
    let e = f.load();
    assert_eq!(e.env.local["API_URL"].value, "repo");
    assert_eq!(e.user_env.local["API_URL"].value, "mine");
    assert_eq!(e.user_env.local["ONLY_USER"].value, "u");
    assert!(e
        .user_env
        .local
        .values()
        .all(|v| v.source.layer == Layer::User));
}
