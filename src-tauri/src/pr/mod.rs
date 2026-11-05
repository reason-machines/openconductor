//! Pull requests: read a workspace branch's PR from GitHub, derive what the
//! workspace header should offer (create, fix checks, merge, ...), and run
//! the `gh` commands behind those actions.
//!
//! Behavior follows the reference app as recovered from its shipped
//! frontend bundle; `evidence/pr/NOTES.md` lists each source location, what
//! we match and what differs on purpose.
//!
//! * [`model`]: GraphQL wire types for the fields we select.
//! * [`checks`]: collapse check re-runs and summarize passing / pending /
//!   failing.
//! * [`info`]: normalized PR info and the workspace status it implies.
//! * [`merge_eligibility`]: when the merge button may be offered.
//! * [`header`]: what the workspace header's git/PR control shows.

pub mod checks;
pub mod header;
pub mod info;
pub mod merge_eligibility;
pub mod model;

#[cfg(test)]
mod checks_tests;
#[cfg(test)]
mod header_tests;
#[cfg(test)]
mod info_tests;
#[cfg(test)]
mod merge_eligibility_tests;
#[cfg(test)]
mod tests;
