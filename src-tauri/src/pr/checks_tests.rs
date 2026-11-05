use super::checks::{dedupe_latest, parse_timestamp_ms, summarize, ChecksStatus};
use super::model::{Check, MergeStateStatus};

fn run(name: &str, workflow: &str, completed: &str, conclusion: &str) -> Check {
    Check {
        name: Some(name.into()),
        workflow_name: Some(workflow.into()),
        completed_at: Some(completed.into()),
        status: Some("COMPLETED".into()),
        conclusion: Some(conclusion.into()),
        ..Default::default()
    }
}

fn status_ctx(context: &str, state: &str, url: &str) -> Check {
    Check {
        context: Some(context.into()),
        state: Some(state.into()),
        target_url: Some(url.into()),
        ..Default::default()
    }
}

fn pending_run(name: &str) -> Check {
    Check {
        name: Some(name.into()),
        status: Some("IN_PROGRESS".into()),
        ..Default::default()
    }
}

#[test]
fn timestamps_parse_like_date_parse() {
    assert_eq!(parse_timestamp_ms("1970-01-01T00:00:00Z"), Some(0));
    assert_eq!(
        parse_timestamp_ms("2026-11-05T10:20:16Z"),
        Some(1_793_874_016_000)
    );
    assert_eq!(parse_timestamp_ms("1970-01-01T00:00:01.5Z"), Some(1_500));
    assert_eq!(parse_timestamp_ms("1970-01-01T01:00:00+01:00"), Some(0));
    assert_eq!(parse_timestamp_ms("not a date"), None);
    assert_eq!(parse_timestamp_ms("2026-13-01T00:00:00Z"), None);
}

#[test]
fn reruns_collapse_to_latest_keeping_first_position() {
    let checks = vec![
        run("build", "CI", "2026-01-01T00:00:00Z", "FAILURE"),
        run("lint", "CI", "2026-01-01T00:00:00Z", "SUCCESS"),
        run("build", "CI", "2026-01-01T00:05:00Z", "SUCCESS"),
        // Same name in another workflow is a different check.
        run("build", "Release", "2026-01-01T00:00:00Z", "SUCCESS"),
    ];
    let out = dedupe_latest(checks);
    assert_eq!(out.len(), 3);
    assert_eq!(
        out[0].conclusion.as_deref(),
        Some("SUCCESS"),
        "rerun replaced in place"
    );
    assert_eq!(out[1].name.as_deref(), Some("lint"));
    assert_eq!(out[2].workflow_name.as_deref(), Some("Release"));
}

#[test]
fn ties_and_missing_times_prefer_the_later_entry() {
    let a = run("t", "W", "garbage", "FAILURE");
    let mut b = run("t", "W", "garbage", "SUCCESS");
    b.completed_at = None;
    let out = dedupe_latest(vec![a, b]);
    assert_eq!(out[0].conclusion.as_deref(), Some("SUCCESS"));
    // An older rerun listed later does not win.
    let out = dedupe_latest(vec![
        run("t", "W", "2026-01-02T00:00:00Z", "SUCCESS"),
        run("t", "W", "2026-01-01T00:00:00Z", "FAILURE"),
    ]);
    assert_eq!(out[0].conclusion.as_deref(), Some("SUCCESS"));
}

#[test]
fn clean_merge_state_is_passing_even_with_failed_optional_checks() {
    let s = summarize(
        MergeStateStatus::Clean,
        Some(vec![run("opt", "CI", "2026-01-01T00:00:00Z", "FAILURE")]),
    );
    assert_eq!(s.status, Some(ChecksStatus::Passing));
    assert!(s.failing.is_empty());
    assert_eq!(s.num_checks, Some(1));
}

#[test]
fn failing_wins_over_pending_and_counts_are_reported() {
    let s = summarize(
        MergeStateStatus::Blocked,
        Some(vec![
            run("a", "CI", "2026-01-01T00:00:00Z", "TIMED_OUT"),
            pending_run("b"),
            status_ctx("deploy", "PENDING", "https://example.test"),
            run("c", "CI", "2026-01-01T00:00:00Z", "SUCCESS"),
        ]),
    );
    assert_eq!(s.status, Some(ChecksStatus::Failing));
    assert_eq!(s.num_pending, 2);
    assert_eq!(s.num_checks, Some(4));
    assert_eq!(s.failing.len(), 1);

    let s = summarize(MergeStateStatus::Blocked, Some(vec![pending_run("b")]));
    assert_eq!(s.status, Some(ChecksStatus::Pending));
    let s = summarize(
        MergeStateStatus::Unstable,
        Some(vec![run("c", "CI", "2026-01-01T00:00:00Z", "NEUTRAL")]),
    );
    assert_eq!(s.status, Some(ChecksStatus::Passing));
}

#[test]
fn no_checks_and_not_clean_leaves_status_unknown() {
    assert_eq!(
        summarize(MergeStateStatus::Blocked, Some(vec![])).status,
        None
    );
    let s = summarize(MergeStateStatus::Unknown, None);
    assert_eq!(s.status, None);
    assert_eq!(s.num_checks, None);
}

#[test]
fn single_failing_vercel_deployment_exposes_its_url() {
    let v = status_ctx("Vercel", "FAILURE", "https://vercel.com/acme/app/123");
    let s = summarize(MergeStateStatus::Unstable, Some(vec![v.clone()]));
    assert_eq!(
        s.vercel_url.as_deref(),
        Some("https://vercel.com/acme/app/123")
    );
    let other = status_ctx("vercel-preview", "ERROR", "https://vercel.com/acme/other");
    let s = summarize(MergeStateStatus::Unstable, Some(vec![v, other]));
    assert_eq!(s.vercel_url, None, "ambiguous when two match");
}
