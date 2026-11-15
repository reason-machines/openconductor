//! What the "Approve PRs" approval level holds for the user: a tool call
//! that publishes work, meaning a push or a change to a pull request.
//!
//! At that level the chat runs Claude Code in `default` mode, where every
//! command arrives as a permission prompt, and answers each one itself
//! unless [`publishes`] says it leaves the machine ([`super::runner`]).
//! [`add_ask_rules`] also gives Claude Code `ask` rules for the same
//! commands, so one the user allowed in their own Claude settings still
//! prompts (checked with Claude Code 2.1.325: an `ask` rule outranks an
//! `allow` rule and the prompt arrives over stdio).
//!
//! This reads the command text; it is a checkpoint for an agent that is
//! not trying to avoid it, not a sandbox. A push hidden behind a git alias,
//! a script or a variable is not seen. A command that only mentions one
//! (`echo "git push"`) is held too, which costs one extra click.

use serde_json::{json, Value};

/// `gh pr` subcommands that change a pull request.
const GH_PR_WRITES: [&str; 12] = [
    "create",
    "merge",
    "ready",
    "edit",
    "close",
    "reopen",
    "review",
    "comment",
    "update-branch",
    "revert",
    "lock",
    "unlock",
];

/// `glab mr` subcommands that change a merge request.
const GLAB_MR_WRITES: [&str; 8] = [
    "create", "merge", "update", "close", "reopen", "approve", "note", "rebase",
];

/// git options that take their value as the next word.
const GIT_VALUE_OPTIONS: [&str; 6] = [
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "--namespace",
    "--config-env",
];

/// `gh` and `glab` options that take the repository as the next word.
const REPO_OPTIONS: [&str; 2] = ["-R", "--repo"];

/// Whether the call to `tool` with `input` pushes commits or changes a pull
/// request.
pub fn publishes(tool: &str, input: &Value) -> bool {
    match tool {
        "Bash" => input["command"].as_str().is_some_and(command_publishes),
        _ => mcp_publishes(tool),
    }
}

/// Adds Claude Code `permissions.ask` rules for the publishing commands to
/// the launch's `--settings`.
pub fn add_ask_rules(settings: &mut Option<Value>) -> Result<(), String> {
    const NOT_OBJECT: &str =
        "Claude Code launch settings must be an object to ask before publishing.";
    let object = settings
        .get_or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or(NOT_OBJECT)?;
    let permissions = object
        .entry("permissions")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or(NOT_OBJECT)?;
    let ask = permissions
        .entry("ask")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or(NOT_OBJECT)?;
    for rule in ask_rules() {
        let rule = Value::String(rule);
        if !ask.contains(&rule) {
            ask.push(rule);
        }
    }
    Ok(())
}

fn ask_rules() -> Vec<String> {
    let mut rules = vec!["Bash(git push:*)".to_owned()];
    rules.extend(GH_PR_WRITES.iter().map(|v| format!("Bash(gh pr {v}:*)")));
    rules.extend(
        GLAB_MR_WRITES
            .iter()
            .map(|v| format!("Bash(glab mr {v}:*)")),
    );
    rules.push("Bash(gt submit:*)".to_owned());
    rules
}

/// An MCP tool that changes a pull or merge request, or pushes: for example
/// `mcp__github__create_pull_request` and `mcp__github__push_files`.
fn mcp_publishes(tool: &str) -> bool {
    let Some(rest) = tool.strip_prefix("mcp__") else {
        return false;
    };
    let name = rest.rsplit("__").next().unwrap_or(rest).to_lowercase();
    if name.contains("push") {
        return true;
    }
    let about_a_request = ["pull_request", "pullrequest", "merge_request", "mergerequest"]
        .iter()
        .any(|k| name.contains(k));
    let reads = ["get", "list", "search", "read", "view", "fetch"]
        .iter()
        .any(|verb| name.starts_with(verb));
    about_a_request && !reads
}

#[derive(Debug, PartialEq)]
enum Token {
    Word(String),
    /// The end of a simple command: `;`, `&&`, `|`, a newline, a bracket.
    Break,
}

/// The command's words with quotes removed, so a command inside
/// `sh -c "..."` or `$(...)` is read like one typed directly. Inside quotes
/// nothing ends the simple command, so a quoted argument (a multi-line
/// GraphQL mutation) stays with the command it belongs to.
fn tokens(command: &str) -> Vec<Token> {
    let mut out = Vec::new();
    let mut word = String::new();
    let mut quote: Option<char> = None;
    let mut chars = command.chars().peekable();
    let flush = |word: &mut String, out: &mut Vec<Token>| {
        if !word.is_empty() {
            out.push(Token::Word(std::mem::take(word)));
        }
    };
    while let Some(c) = chars.next() {
        match (quote, c) {
            (Some(q), c) if c == q => {
                quote = None;
                flush(&mut word, &mut out);
            }
            (None, '"' | '\'') => {
                quote = Some(c);
                flush(&mut word, &mut out);
            }
            // A continued line is one command; any other escape is dropped.
            (None | Some('"'), '\\') => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                    flush(&mut word, &mut out);
                }
            }
            (None, ';' | '&' | '|' | '\n' | '(' | ')' | '{' | '}' | '<' | '>') => {
                flush(&mut word, &mut out);
                if out.last() != Some(&Token::Break) {
                    out.push(Token::Break);
                }
            }
            (_, '`' | ';' | '&' | '|' | '(' | ')' | '{' | '}' | '<' | '>') => {
                flush(&mut word, &mut out)
            }
            (_, c) if c.is_whitespace() => flush(&mut word, &mut out),
            (_, c) => word.push(c),
        }
    }
    flush(&mut word, &mut out);
    out
}

fn command_publishes(command: &str) -> bool {
    let tokens = tokens(command);
    tokens.iter().enumerate().any(|(i, token)| {
        let Token::Word(word) = token else {
            return false;
        };
        // The words after this one, up to the end of its simple command.
        let rest: Vec<&str> = tokens[i + 1..]
            .iter()
            .map_while(|t| match t {
                Token::Word(w) => Some(w.as_str()),
                Token::Break => None,
            })
            .collect();
        match word.rsplit('/').next().unwrap_or(word) {
            // Also `jj git push`.
            "git" => subcommand(&rest, &GIT_VALUE_OPTIONS).is_some_and(|(sub, _)| sub == "push"),
            "gh" => gh_publishes(&rest),
            "glab" => subcommand(&rest, &REPO_OPTIONS).is_some_and(|(sub, after)| {
                sub == "mr"
                    && subcommand(after, &REPO_OPTIONS)
                        .is_some_and(|(verb, _)| GLAB_MR_WRITES.contains(&verb))
            }),
            "gt" => {
                rest.contains(&"submit") || first_word(&rest).is_some_and(|v| v == "ss" || v == "merge")
            }
            _ => false,
        }
    })
}

/// The first word that is not an option (skipping the value of an option in
/// `value_options`), and the words after it.
fn subcommand<'a>(words: &'a [&'a str], value_options: &[&str]) -> Option<(&'a str, &'a [&'a str])> {
    let mut i = 0;
    while i < words.len() {
        let word = words[i];
        if !word.starts_with('-') {
            return Some((word, &words[i + 1..]));
        }
        i += if value_options.contains(&word) { 2 } else { 1 };
    }
    None
}

fn first_word<'a>(words: &'a [&'a str]) -> Option<&'a str> {
    words.iter().copied().find(|w| !w.starts_with('-'))
}

fn gh_publishes(rest: &[&str]) -> bool {
    match subcommand(rest, &REPO_OPTIONS) {
        Some(("pr", after)) => {
            subcommand(after, &REPO_OPTIONS).is_some_and(|(verb, _)| GH_PR_WRITES.contains(&verb))
        }
        Some(("api", after)) => gh_api_publishes(after),
        _ => false,
    }
}

/// `gh api` writing to a pull request, a merge or a branch ref, or sending
/// a GraphQL mutation.
fn gh_api_publishes(words: &[&str]) -> bool {
    let lower: Vec<String> = words.iter().map(|w| w.to_lowercase()).collect();
    if lower.iter().any(|w| w == "graphql") {
        return lower.iter().any(|w| w.contains("mutation"));
    }
    let target = lower
        .iter()
        .any(|w| ["pulls", "/merges", "git/refs"].iter().any(|k| w.contains(k)));
    let method = lower.iter().enumerate().find_map(|(i, w)| {
        if let Some(value) = w.strip_prefix("--method=") {
            return Some(value.to_owned());
        }
        if w == "-x" || w == "--method" {
            return lower.get(i + 1).cloned();
        }
        w.strip_prefix("-x").filter(|v| !v.is_empty()).map(str::to_owned)
    });
    let has_fields = lower.iter().any(|w| {
        ["-f", "--field", "--raw-field", "--input"]
            .iter()
            .any(|flag| w == flag || w.starts_with(&format!("{flag}=")))
    });
    // `gh api` sends POST once a field is given, unless a method says otherwise.
    let writes = match method.as_deref() {
        Some(m) => m != "get",
        None => has_fields,
    };
    target && writes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bash(command: &str) -> bool {
        publishes("Bash", &json!({ "command": command }))
    }

    #[test]
    fn pushes_are_held_however_git_is_called() {
        for command in [
            "git push",
            "git push -u origin feature",
            "git push --force-with-lease",
            "git -C /w/repo push origin HEAD",
            "git -c push.default=current --no-pager push",
            "/usr/bin/git push",
            "git add -A && git commit -m wip && git push",
            "cd /w && (git fetch; git push origin main)",
            "git commit -m 'x'\ngit push",
            "sh -c \"git push origin main\"",
            "echo $(git push 2>&1)",
            "GIT_SSH_COMMAND='ssh -i k' git push",
            "git \\\n  push origin main",
            "jj git push --bookmark feature",
        ] {
            assert!(bash(command), "{command}");
        }
    }

    #[test]
    fn local_git_work_and_reads_run_without_asking() {
        for command in [
            "git status",
            "git commit -m 'push the button'",
            "git log --oneline -5",
            "git fetch origin && git rebase origin/main",
            "git stash push -m wip",
            "git config push.default current",
            "git -C /w/repo pull --rebase",
            "git remote -v",
            "npm test",
            "cargo test publish",
            "ls pushed/",
            "gh pr view 12 --json state",
            "gh pr list",
            "gh pr checks 12 --watch",
            "gh pr diff 12",
            "gh pr checkout 12",
            "gh pr status",
            "gh run view 9 --log-failed",
            "gh api repos/o/r/pulls/12",
            "gh api repos/o/r/pulls/12/comments --paginate",
            "gh api -X GET repos/o/r/pulls -f state=open",
            "gh api graphql -f query='query { viewer { login } }'",
            "gh issue create --title t --body b",
            "gt log",
            "glab mr view 4",
            "",
        ] {
            assert!(!bash(command), "{command}");
        }
    }

    #[test]
    fn pull_request_changes_are_held() {
        for command in [
            "gh pr create --fill",
            "gh pr create --title 't' --body \"$(cat body.md)\"",
            "gh -R o/r pr merge 12 --squash",
            "gh pr --repo o/r ready 12",
            "gh pr edit 12 --add-label ship",
            "gh pr close 12",
            "gh pr review 12 --approve",
            "gh pr comment 12 --body done",
            "gh api repos/o/r/pulls -f title=t -f head=b -f base=main",
            "gh api -X PUT repos/o/r/pulls/12/merge",
            "gh api --method=PATCH repos/o/r/pulls/12 -f state=closed",
            "gh api -XPOST repos/o/r/merges -f base=main -f head=b",
            "gh api repos/o/r/git/refs -f ref=refs/heads/b -f sha=abc",
            "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
            "gh api graphql -f query='\n  mutation {\n    createPullRequest(input: {}) { clientMutationId }\n  }'",
            "gt submit --stack",
            "gt stack submit",
            "gt ss",
            "glab mr create --fill",
            "glab mr merge 4",
            "npm test && gh pr create --fill",
        ] {
            assert!(bash(command), "{command}");
        }
    }

    #[test]
    fn a_command_that_only_mentions_a_push_is_held_too() {
        // Reading quotes as plain words keeps `sh -c "git push"` held; the
        // price is asking about these.
        assert!(bash("echo \"run git push when ready\""));
        assert!(bash("git commit -m 'then git push it'"));
    }

    #[test]
    fn only_bash_and_publishing_mcp_tools_are_held() {
        let edit = json!({ "file_path": "/w/a.rs", "old_string": "git push", "new_string": "x" });
        assert!(!publishes("Edit", &edit));
        assert!(!publishes("Write", &json!({ "file_path": "/w/push.sh", "content": "git push" })));
        assert!(!publishes("Read", &json!({ "file_path": "/w/a.rs" })));
        assert!(!publishes("Bash", &json!({})));
        assert!(!publishes("Bash", &json!({ "command": 7 })));
        for tool in [
            "mcp__github__create_pull_request",
            "mcp__github__merge_pull_request",
            "mcp__github__update_pull_request_branch",
            "mcp__github__push_files",
            "mcp__gitlab__create_merge_request",
        ] {
            assert!(publishes(tool, &json!({})), "{tool}");
        }
        for tool in [
            "mcp__github__get_pull_request",
            "mcp__github__list_pull_requests",
            "mcp__github__search_pull_requests",
            "mcp__github__create_issue",
            "mcp__linear__list_issues",
        ] {
            assert!(!publishes(tool, &json!({})), "{tool}");
        }
    }

    #[test]
    fn ask_rules_join_the_launch_settings_once_and_keep_what_is_there() {
        let mut settings = Some(json!({
            "fastMode": true,
            "permissions": { "ask": ["Bash(rm:*)"], "deny": ["Read(.env)"] },
        }));
        add_ask_rules(&mut settings).unwrap();
        add_ask_rules(&mut settings).unwrap();
        let s = settings.unwrap();
        assert_eq!(s["fastMode"], true);
        assert_eq!(s["permissions"]["deny"], json!(["Read(.env)"]));
        let ask: Vec<&str> = s["permissions"]["ask"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .collect();
        assert_eq!(ask[0], "Bash(rm:*)");
        for rule in ["Bash(git push:*)", "Bash(gh pr create:*)", "Bash(gh pr merge:*)", "Bash(gt submit:*)"] {
            assert_eq!(ask.iter().filter(|r| **r == rule).count(), 1, "{rule}");
        }

        let mut none = None;
        add_ask_rules(&mut none).unwrap();
        assert!(none.unwrap()["permissions"]["ask"].as_array().is_some_and(|a| !a.is_empty()));

        assert!(add_ask_rules(&mut Some(json!("fast"))).is_err());
        assert!(add_ask_rules(&mut Some(json!({ "permissions": [] }))).is_err());
        assert!(add_ask_rules(&mut Some(json!({ "permissions": { "ask": "all" } }))).is_err());
    }
}
