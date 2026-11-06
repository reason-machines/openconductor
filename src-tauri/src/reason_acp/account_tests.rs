use super::account::{parse_login, parse_status, Workspace};

/// `reason status --json` (0.2.692), names and ids replaced.
const SIGNED_IN: &str = r#"{
  "version": "0.2.692",
  "channel": "production",
  "account": { "id": "u1", "name": "Ada Lovelace", "email": "ada@example.com", "credential": "login" },
  "account_error": null,
  "organization": { "id": "o1", "name": "Reason Tests", "slug": "reason-tests" },
  "workspaces": [
    { "id": "o1", "slug": "reason-tests", "name": "Reason Tests", "selected": true },
    { "id": "o2", "slug": "reason-experiments", "name": "Reason Experiments", "selected": false },
    { "id": "o3", "slug": "sven-2", "name": "Ara", "selected": false }
  ],
  "mcp": [],
  "connection": { "workspaces": [
    { "organization_id": "other-org", "state": "connected", "blocked": false },
    { "organization_id": "o2", "state": "connected", "blocked": false },
    { "organization_id": "o3", "state": "disconnected", "blocked": false }
  ] }
}"#;

/// `reason status --json` (0.2.673) on a computer that never signed in.
const SIGNED_OUT: &str = r#"{"version":"0.2.673","channel":"production","account":null,
  "account_error":null,"organization":null,"workspaces":[],"mcp":[],"connection":null,"disconnected":false}"#;

#[test]
fn status_reads_account_workspaces_and_connection() {
    let a = parse_status(SIGNED_IN).unwrap();
    assert!(a.signed_in());
    assert_eq!(a.version.as_deref(), Some("0.2.692"));
    assert_eq!(a.email.as_deref(), Some("ada@example.com"));
    assert_eq!(a.credential.as_deref(), Some("login"));
    assert_eq!(a.organization.as_deref(), Some("Reason Tests"));
    assert!(a.computer_connected);
    assert_eq!(
        a.workspaces,
        vec![
            Workspace {
                slug: "reason-tests".into(),
                name: "Reason Tests".into(),
                selected: true,
                connected: false
            },
            Workspace {
                slug: "reason-experiments".into(),
                name: "Reason Experiments".into(),
                selected: false,
                connected: true
            },
            Workspace {
                slug: "sven-2".into(),
                name: "Ara".into(),
                selected: false,
                connected: false
            },
        ]
    );
}

#[test]
fn status_signed_out_has_no_account() {
    let a = parse_status(SIGNED_OUT).unwrap();
    assert!(!a.signed_in());
    assert_eq!(a.version.as_deref(), Some("0.2.673"));
    assert!(a.workspaces.is_empty());
    assert!(!a.computer_connected);
    assert!(parse_status("not json").is_none());
}

#[test]
fn status_keeps_an_account_error() {
    let a = parse_status(r#"{"version":"1","account":null,"account_error":"401 invalid api key"}"#)
        .unwrap();
    assert_eq!(a.error.as_deref(), Some("401 invalid api key"));
}

#[test]
fn login_reads_link_and_code() {
    let out = "Open this link to sign in to Reason: https://reasonmachines.com/cli/connect?request=231463ce-6b31\n\
               The page shows the code 4S7V-AE6D.\n\
               It finishes on its own once you have; run `reason login` again any time to see where it stands.";
    let p = parse_login(out);
    assert_eq!(
        p.url.as_deref(),
        Some("https://reasonmachines.com/cli/connect?request=231463ce-6b31")
    );
    assert_eq!(p.code.as_deref(), Some("4S7V-AE6D"));
    let again = parse_login(&format!("Not signed in yet. {out}"));
    assert_eq!(again.code.as_deref(), Some("4S7V-AE6D"));
    let done = parse_login("Signed in as ada@example.com");
    assert_eq!((done.url, done.code), (None, None));
    assert_eq!(done.message, "Signed in as ada@example.com");
}
