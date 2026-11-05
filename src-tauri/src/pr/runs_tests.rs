use std::path::PathBuf;

use super::gh_tests::{gh_cwd, Fake};
use super::runs::{
    fetch_check_log, is_blob_not_found, rerun_failed, rerun_run_ids, tail_lines, ActionsJob,
    CheckLog, CheckLogRequest, LogError, JOB_NOT_STARTED, LOG_TAIL_LINES, NO_RUN_IDS,
};

const JOB_URL: &str = "https://github.com/acme/app/actions/runs/111/job/222";

fn request(url: &str) -> CheckLogRequest {
    CheckLogRequest {
        name: Some("build".into()),
        conclusion: Some("FAILURE".into()),
        details_url: Some(url.into()),
    }
}

#[test]
fn actions_job_urls_parse_and_others_do_not() {
    assert_eq!(
        ActionsJob::parse(JOB_URL),
        Some(ActionsJob {
            owner: "acme".into(),
            repo: "app".into(),
            run_id: 111,
            job_id: 222
        })
    );
    let with_query =
        ActionsJob::parse("https://github.com/acme/app/actions/runs/1/job/2?pr=5").unwrap();
    assert_eq!(
        (with_query.run_id, with_query.job_id),
        (1, 2),
        "suffix after the job id is ignored"
    );
    for other in [
        "https://vercel.com/acme/app/xyz",
        "https://github.com/acme/app/runs/333",
        "https://github.com/acme/app/actions/runs/abc/job/2",
        "https://github.com/acme/app/actions/runs/1/job/",
        "https://ci.example.com/build/9",
    ] {
        assert_eq!(ActionsJob::parse(other), None, "{other}");
    }
}

#[test]
fn rerun_ids_are_distinct_runs_in_first_seen_order() {
    let urls = [
        "https://github.com/a/b/actions/runs/9/job/1",
        "https://ci.example.com/x",
        "https://github.com/a/b/actions/runs/7/job/3",
        "https://github.com/a/b/actions/runs/9/job/2",
    ];
    assert_eq!(rerun_run_ids(urls), vec![9, 7]);
}

#[test]
fn rerun_runs_gh_run_rerun_failed_per_run_in_the_checkout() {
    let fake = Fake::default();
    let urls = vec![
        "https://github.com/a/b/actions/runs/9/job/1".to_string(),
        "https://github.com/a/b/actions/runs/7/job/3".to_string(),
    ];
    assert_eq!(rerun_failed(&gh_cwd(&fake), &urls).unwrap(), vec![9, 7]);
    let calls = fake.calls.borrow();
    assert_eq!(calls[0].0, ["run", "rerun", "9", "--failed"]);
    assert_eq!(calls[1].0, ["run", "rerun", "7", "--failed"]);
    assert_eq!(calls[0].1, Some(PathBuf::from("/w")));
}

#[test]
fn rerun_without_actions_jobs_or_with_a_failure_errors() {
    let fake = Fake::default();
    let err = rerun_failed(&gh_cwd(&fake), &["https://ci.example.com/x".to_string()]).unwrap_err();
    assert_eq!(err, NO_RUN_IDS);
    assert!(fake.calls.borrow().is_empty());

    fake.reply(1, "", "");
    let err = rerun_failed(&gh_cwd(&fake), &[JOB_URL.to_string()]).unwrap_err();
    assert_eq!(err, "Failed to re-run workflow 111");
    fake.reply(
        1,
        "",
        "run 111 cannot be rerun; its workflow file may be broken\n",
    );
    let err = rerun_failed(&gh_cwd(&fake), &[JOB_URL.to_string()]).unwrap_err();
    assert_eq!(
        err,
        "run 111 cannot be rerun; its workflow file may be broken"
    );
}

#[test]
fn logs_come_from_the_jobs_logs_endpoint_trimmed_to_the_tail() {
    let fake = Fake::default();
    let long: String = (1..=LOG_TAIL_LINES + 5)
        .map(|i| format!("line {i}\n"))
        .collect();
    fake.reply(0, &long, "");
    let log = fetch_check_log(&gh_cwd(&fake), &request(JOB_URL)).unwrap();
    assert_eq!(
        fake.last_args(),
        ["api", "repos/acme/app/actions/jobs/222/logs"]
    );
    let CheckLog::Logs {
        logs, job_id, name, ..
    } = log
    else {
        panic!("logs")
    };
    assert_eq!(job_id, 222);
    assert_eq!(name.as_deref(), Some("build"));
    assert_eq!(logs.split('\n').count(), LOG_TAIL_LINES);
    assert!(logs.starts_with("line 7\n"), "{}", &logs[..20]);
}

#[test]
fn non_actions_checks_have_no_log() {
    let fake = Fake::default();
    let err = fetch_check_log(&gh_cwd(&fake), &request("https://vercel.com/x")).unwrap_err();
    assert!(matches!(err, LogError::NotActionsJob));
    assert!(fake.calls.borrow().is_empty());
}

const BLOB_404: &str = "<?xml version=\"1.0\"?><Error><Code>BlobNotFound</Code><Message>gone</Message></Error>\ngh: HTTP 404";

#[test]
fn blob_not_found_detection_needs_the_xml_and_the_404() {
    assert!(is_blob_not_found(BLOB_404));
    assert!(!is_blob_not_found("gh: HTTP 404"));
    assert!(!is_blob_not_found(
        "<Error><Code>BlobNotFound</Code></Error>\ngh: HTTP 500"
    ));
}

#[test]
fn unstarted_job_shows_annotations_instead_of_a_log() {
    let fake = Fake::default();
    fake.reply(1, BLOB_404, "");
    fake.reply(0, r#"{"steps": [], "runner_name": "", "check_run_url": "https://api.github.com/repos/acme/app/check-runs/5"}"#, "");
    fake.reply(
        0,
        "The job was not started because your account is locked.\n",
        "",
    );
    let log = fetch_check_log(&gh_cwd(&fake), &request(JOB_URL)).unwrap();
    let calls = fake.calls.borrow();
    assert_eq!(calls[1].0, ["api", "repos/acme/app/actions/jobs/222"]);
    assert_eq!(
        calls[2].0,
        [
            "api",
            "https://api.github.com/repos/acme/app/check-runs/5/annotations",
            "--paginate",
            "--jq",
            "map(.message) | join(\"\\n\\n\")"
        ]
    );
    assert_eq!(
        log,
        CheckLog::Unavailable {
            name: Some("build".into()),
            conclusion: Some("FAILURE".into()),
            message: JOB_NOT_STARTED.into(),
            annotation: Some("The job was not started because your account is locked.".into()),
            job_id: 222,
        }
    );
}

#[test]
fn missing_log_for_a_started_job_is_an_error() {
    let fake = Fake::default();
    fake.reply(1, BLOB_404, "");
    fake.reply(0, r#"{"steps": [{"name": "x"}], "runner_name": "gh-1", "check_run_url": "https://api.github.com/c/5"}"#, "");
    let err = fetch_check_log(&gh_cwd(&fake), &request(JOB_URL)).unwrap_err();
    assert!(matches!(err, LogError::NoArchivedLog));
}

#[test]
fn other_gh_failures_surface() {
    let fake = Fake::default();
    fake.reply(1, "", "HTTP 403: Must have admin rights");
    let err = fetch_check_log(&gh_cwd(&fake), &request(JOB_URL)).unwrap_err();
    assert!(err.to_string().contains("Must have admin rights"), "{err}");
}

#[test]
fn check_log_wire_format_is_tagged_camel_case() {
    let log = CheckLog::Unavailable {
        name: None,
        conclusion: None,
        message: "m".into(),
        annotation: None,
        job_id: 1,
    };
    let json = serde_json::to_value(&log).unwrap();
    assert_eq!(json["kind"], "unavailable");
    assert_eq!(json["jobId"], 1);
    assert_eq!(tail_lines("a\nb\nc", 2), "b\nc");
}
