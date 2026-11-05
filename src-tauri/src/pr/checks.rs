//! Status-check rollup: collapse re-runs to the latest result per check and
//! summarize them as passing / pending / failing.

use std::collections::HashMap;

use super::model::{Check, MergeStateStatus};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChecksStatus {
    Passing,
    Pending,
    Failing,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ChecksSummary {
    /// `None` when GitHub did not report the PR as clean and it has no checks.
    pub status: Option<ChecksStatus>,
    pub num_pending: usize,
    /// Number of distinct checks after de-duplication; `None` without a rollup.
    pub num_checks: Option<usize>,
    pub failing: Vec<Check>,
    pub checks: Option<Vec<Check>>,
    /// Preview URL when exactly one failing check is a Vercel deployment.
    pub vercel_url: Option<String>,
}

const PENDING_STATUSES: [&str; 3] = ["IN_PROGRESS", "EXPECTED", "QUEUED"];
const PENDING_STATES: [&str; 2] = ["PENDING", "EXPECTED"];
const FAILING_CONCLUSIONS: [&str; 5] = [
    "FAILURE",
    "ERROR",
    "CANCELLED",
    "TIMED_OUT",
    "ACTION_REQUIRED",
];
const FAILING_STATES: [&str; 3] = ["FAILURE", "ERROR", "STARTUP_FAILURE"];

fn is_in(value: &Option<String>, set: &[&str]) -> bool {
    value.as_deref().is_some_and(|v| set.contains(&v))
}

pub fn is_pending(c: &Check) -> bool {
    is_in(&c.status, &PENDING_STATUSES) || is_in(&c.state, &PENDING_STATES)
}

pub fn is_failing(c: &Check) -> bool {
    is_in(&c.conclusion, &FAILING_CONCLUSIONS) || is_in(&c.state, &FAILING_STATES)
}

/// Identity of a check across re-runs: workflow + name for check runs,
/// context for status contexts, then URLs, then position.
fn identity(c: &Check, index: usize) -> String {
    if let Some(name) = &c.name {
        format!(
            "check-run:{}:{}",
            c.workflow_name.as_deref().unwrap_or(""),
            name
        )
    } else if let Some(ctx) = &c.context {
        format!("status-context:{ctx}")
    } else if let Some(url) = &c.details_url {
        format!("check-run-url:{url}")
    } else if let Some(url) = &c.target_url {
        format!("status-context-url:{url}")
    } else {
        format!("unknown:{index}")
    }
}

/// Completion time, else start time, else 0 (milliseconds since epoch).
fn recency(c: &Check) -> i64 {
    c.completed_at
        .as_deref()
        .and_then(parse_timestamp_ms)
        .or_else(|| c.started_at.as_deref().and_then(parse_timestamp_ms))
        .unwrap_or(0)
}

/// Keep one check per identity: the most recent one, with later entries
/// winning ties. Order follows each identity's first appearance.
pub fn dedupe_latest(checks: Vec<Check>) -> Vec<Check> {
    let mut out: Vec<Check> = Vec::new();
    let mut slot: HashMap<String, usize> = HashMap::new();
    for (i, c) in checks.into_iter().enumerate() {
        let key = identity(&c, i);
        match slot.get(&key) {
            Some(&at) => {
                if recency(&c) >= recency(&out[at]) {
                    out[at] = c;
                }
            }
            None => {
                slot.insert(key, out.len());
                out.push(c);
            }
        }
    }
    out
}

/// Summarize a PR's checks. A `CLEAN` merge state means GitHub already
/// considers every required check satisfied, so it reports passing with no
/// failures even if optional checks failed.
pub fn summarize(merge_state: MergeStateStatus, rollup: Option<Vec<Check>>) -> ChecksSummary {
    let checks = rollup.map(dedupe_latest);
    let num_checks = checks.as_ref().map(Vec::len);
    let mut summary = ChecksSummary {
        num_checks,
        ..Default::default()
    };
    if merge_state == MergeStateStatus::Clean {
        summary.status = Some(ChecksStatus::Passing);
    } else if let Some(list) = checks.as_ref().filter(|l| !l.is_empty()) {
        summary.num_pending = list.iter().filter(|c| is_pending(c)).count();
        summary.failing = list.iter().filter(|c| is_failing(c)).cloned().collect();
        summary.status = Some(if !summary.failing.is_empty() {
            ChecksStatus::Failing
        } else if summary.num_pending > 0 {
            ChecksStatus::Pending
        } else {
            ChecksStatus::Passing
        });
    }
    let vercel: Vec<&Check> = summary
        .failing
        .iter()
        .filter(|c| {
            c.context
                .as_deref()
                .is_some_and(|x| x.eq_ignore_ascii_case("vercel"))
                || c.target_url
                    .as_deref()
                    .is_some_and(|u| u.contains("vercel.com"))
        })
        .collect();
    if let [only] = vercel.as_slice() {
        summary.vercel_url = only.target_url.clone();
    }
    summary.checks = checks;
    summary
}

/// Parse `YYYY-MM-DDTHH:MM:SS[.fff](Z|+HH:MM|-HH:MM)` to epoch milliseconds.
pub fn parse_timestamp_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    let num = |r: std::ops::Range<usize>| -> Option<i64> {
        let part = s.get(r)?;
        if part.bytes().all(|c| c.is_ascii_digit()) {
            part.parse().ok()
        } else {
            None
        }
    };
    if b.len() < 20
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
    {
        return None;
    }
    let (y, mo, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (h, mi, sec) = (num(11..13)?, num(14..16)?, num(17..19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || sec > 60 {
        return None;
    }
    let mut i = 19;
    let mut ms = 0;
    if b[i] == b'.' {
        let start = i + 1;
        i = start;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        let frac = s.get(start..i)?;
        if frac.is_empty() {
            return None;
        }
        ms = format!("{frac:0<3}")[..3].parse().ok()?;
    }
    let offset_min = match s.get(i..)? {
        "Z" | "z" => 0,
        tz if tz.len() == 6 && (tz.starts_with('+') || tz.starts_with('-')) && &tz[3..4] == ":" => {
            let v = num(i + 1..i + 3)? * 60 + num(i + 4..i + 6)?;
            if tz.starts_with('-') {
                -v
            } else {
                v
            }
        }
        _ => return None,
    };
    // Days from civil (Howard Hinnant's algorithm).
    let yy = if mo <= 2 { y - 1 } else { y };
    let era = yy.div_euclid(400);
    let yoe = yy - era * 400;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + h * 3600 + mi * 60 + sec - offset_min * 60;
    Some(secs * 1000 + ms)
}
