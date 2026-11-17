use super::naming::repo_name_from_url;

#[test]
fn clone_basename_normalizes_https_mixed_case() {
    assert_eq!(repo_name_from_url("https://github.com/acme/MyRepo.git").as_deref(), Some("myrepo"));
}

#[test]
fn clone_basename_normalizes_scp_mixed_case() {
    assert_eq!(repo_name_from_url("git@github.com:acme/MyRepo.git").as_deref(), Some("myrepo"));
}

#[test]
fn clone_basename_normalizes_https_repeated_hyphens_and_trailing_slash() {
    assert_eq!(repo_name_from_url("https://github.com/acme/my--repo.git/").as_deref(), Some("my-repo"));
}

#[test]
fn clone_basename_normalizes_scp_mixed_case_with_dots_and_underscores() {
    assert_eq!(repo_name_from_url("git@github.com:acme/Repo_With.Mixed.git").as_deref(), Some("repo_with.mixed"));
}

#[test]
fn clone_basename_control_lowercase_https() {
    assert_eq!(repo_name_from_url("https://github.com/acme/my-repo.git").as_deref(), Some("my-repo"));
}

#[test]
fn clone_basename_control_lowercase_scp() {
    assert_eq!(repo_name_from_url("git@github.com:acme/my-repo.git").as_deref(), Some("my-repo"));
}

#[test]
fn clone_basename_control_dots_and_underscores() {
    assert_eq!(repo_name_from_url("https://github.com/acme/repo_with.mixed.git").as_deref(), Some("repo_with.mixed"));
}

#[test]
fn clone_basename_control_local_path() {
    assert_eq!(repo_name_from_url("/synthetic/remotes/My App").as_deref(), Some("My App"));
}
