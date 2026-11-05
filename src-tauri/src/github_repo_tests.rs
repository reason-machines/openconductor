use super::*;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

/// A `gh` stand-in in a scratch dir: `api user` prints a login, `api user/orgs`
/// prints `orgs` (or fails when `None`), and `repo view acme/taken` succeeds
/// while any other name is not found.
fn fake_gh(name: &str, orgs: Option<&str>) -> (GitHub, PathBuf) {
    let dir = std::env::temp_dir().join(format!("oc-ghrepo-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let orgs = match orgs {
        Some(out) => format!("printf '{out}'"),
        None => "echo 'HTTP 403: Resource not accessible' >&2; exit 1".into(),
    };
    let script = format!(
        "#!/bin/sh\ncase \"$1 $2 $3\" in\n\
         \"api user --jq\") echo octocat ;;\n\
         \"api user/orgs --paginate\") {orgs} ;;\n\
         \"repo view acme/taken\") echo taken ;;\n\
         \"repo view \"*) echo \"GraphQL: Could not resolve to a Repository with the name '$3'.\" >&2; exit 1 ;;\n\
         *) exit 2 ;;\nesac\n"
    );
    let path = dir.join("gh");
    fs::write(&path, script).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
    let gh = GitHub {
        gh: path.display().to_string(),
    };
    (gh, dir)
}

#[test]
fn availability_follows_gh_repo_view() {
    use Availability::*;
    assert_eq!(classify_view(true, "demo", ""), Ok(Taken));
    let missing = "GraphQL: Could not resolve to a Repository with the name 'acme/x'.";
    assert_eq!(classify_view(false, "", missing), Ok(Available));
    assert_eq!(
        classify_view(false, "", "HTTP 404: Not Found"),
        Ok(Available)
    );
    let auth = classify_view(false, "", "HTTP 401: Bad credentials");
    assert_eq!(auth, Err("HTTP 401: Bad credentials".into()));
    let empty = classify_view(false, "", "");
    assert_eq!(
        empty,
        Err("Failed to check GitHub repository availability".into())
    );

    let (gh, dir) = fake_gh("view", Some(""));
    assert_eq!(gh.availability("acme", "taken"), Ok(Taken));
    assert_eq!(gh.availability("acme", "fresh"), Ok(Available));
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn owners_are_user_then_orgs() {
    let (gh, dir) = fake_gh("owners", Some("acme\\n\\nwidgets\\n"));
    let owners = gh.owners().unwrap();
    let logins: Vec<_> = owners
        .owners
        .iter()
        .map(|o| (o.login.as_str(), o.kind))
        .collect();
    let expected = [
        ("octocat", OwnerKind::User),
        ("acme", OwnerKind::Org),
        ("widgets", OwnerKind::Org),
    ];
    assert_eq!(logins, expected);
    assert_eq!(owners.orgs_error, None);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn failing_orgs_still_offer_the_personal_account() {
    let (gh, dir) = fake_gh("noorgs", None);
    let owners = gh.owners().unwrap();
    assert_eq!(owners.owners.len(), 1);
    assert_eq!(owners.owners[0].login, "octocat");
    let err = owners.orgs_error.as_deref();
    assert_eq!(err, Some("HTTP 403: Resource not accessible"));
    fs::remove_dir_all(dir).unwrap();
}
