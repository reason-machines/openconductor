//! Creating a PR is delegated to the workspace's agent: the Create PR
//! button sends it a message built here, and the agent commits, pushes and
//! runs `gh pr create`. Wording is ours; the steps and inputs follow the
//! reference app.

/// Inputs for the create-PR message.
#[derive(Debug, Clone, Default)]
pub struct CreatePrRequest<'a> {
    pub branch: &'a str,
    pub remote: &'a str,
    pub target_branch: &'a str,
    pub draft: bool,
    /// Name of a tool the agent has for reading the workspace diff; when
    /// `None` the agent is told to use `git diff`.
    pub diff_tool: Option<&'a str>,
    /// Title / description the user typed; used verbatim.
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    /// The repository's PR template, used when no description was given.
    pub template: Option<&'a str>,
    /// Repository setting "custom instructions for Create PR".
    pub custom_instructions: Option<&'a str>,
}

fn present(s: Option<&str>) -> Option<&str> {
    s.filter(|s| !s.trim().is_empty())
}

/// Build the message sent to the agent.
pub fn create_pr_prompt(r: &CreatePrRequest) -> String {
    let title = present(r.title);
    let description = present(r.description);
    let mut create = format!("Open the PR with `gh pr create --base {}", r.target_branch);
    if r.draft {
        create.push_str(" --draft");
    }
    if title.is_some() {
        create.push_str(" --title <title>");
    }
    if description.is_some() {
        create.push_str(" --body <description>");
    }
    create.push_str("`.");
    if title.is_none() {
        create.push_str(" Write a title of at most 80 characters.");
    }
    if description.is_none() {
        create.push_str(
            " Keep the description to five sentences or fewer unless told otherwise, \
             and cover every change on this branch, not only this conversation's.",
        );
    }
    let review = match r.diff_tool {
        Some(tool) => format!("Read the full branch diff with the `{tool}` tool."),
        None => format!(
            "Read the full branch diff with `git diff {}/{}...`.",
            r.remote, r.target_branch
        ),
    };
    let steps = [
        "If you have a skill for opening pull requests, use it now; where it disagrees with these steps, follow the skill.".to_string(),
        "Run `git status`. Review any uncommitted changes with `git diff` and commit them, following any commit message conventions the user gave you.".to_string(),
        format!(
            "If the branch has no upstream or has commits that are not pushed, push with `git push -u {} HEAD`. If it already tracks a branch with another name or on another remote, push there instead.",
            r.remote
        ),
        review,
        create,
    ];
    let mut out = format!(
        "The user is happy with the current code and wants a {}pull request.\n\nCurrent branch: {}\nTarget: {}/{}\n\nSteps:\n",
        if r.draft { "draft " } else { "" },
        r.branch,
        r.remote,
        r.target_branch
    );
    for (i, step) in steps.iter().enumerate() {
        out.push_str(&format!("{}. {step}\n", i + 1));
    }
    out.push_str("\nIf a step fails, stop and ask the user how to proceed.");
    if let Some(t) = title {
        out.push_str(&format!("\n\n## Title\n\nUse this title exactly:\n{t}"));
    }
    if let Some(d) = description {
        out.push_str(&format!(
            "\n\n## Description\n\nUse this description exactly:\n{d}"
        ));
    } else if let Some(tpl) = present(r.template) {
        out.push_str(&format!(
            "\n\n## Description template\n\nThe repository has a PR template. Fill it in from the changes:\n\n```markdown\n{tpl}\n```"
        ));
    }
    if let Some(c) = present(r.custom_instructions) {
        out.push_str(&format!(
            "\n\n## Repository instructions\n\nThese come from the repository's settings and take precedence over the steps above:\n\n{}",
            c.trim()
        ));
    }
    out
}

/// Where the repository's PR template may live, relative to the workspace
/// checkout, in the order the reference tries them (index @ ~3,210,900,
/// `hNt`): the first file that exists is the template.
pub const PR_TEMPLATE_PATHS: [&str; 3] = [
    "pull_request_template.md",
    ".github/pull_request_template.md",
    "docs/pull_request_template.md",
];

/// The repository's PR template, read from the workspace checkout; `None`
/// when no template file exists or the first one found can't be read.
pub fn find_pr_template(workspace: &std::path::Path) -> Option<String> {
    PR_TEMPLATE_PATHS
        .iter()
        .map(|p| workspace.join(p))
        .find(|p| p.is_file())
        .and_then(|p| std::fs::read_to_string(p).ok())
}

/// After a successful merge, archive the workspace only when the
/// repository's `archive_on_merge` setting is exactly `"true"`, the
/// workspace runs locally, and it is not already archived.
pub fn should_archive_after_merge(
    setting: Option<&str>,
    is_cloud: bool,
    already_archived: bool,
) -> bool {
    setting == Some("true") && !is_cloud && !already_archived
}

/// "Commit and push" (header action and `git.commitAndPush`) is delegated to
/// the workspace's agent with this one-line instruction, the same
/// instruction the reference's GitHub forge sends (index @ ~600,700,
/// `commitAgentInstruction`).
pub const COMMIT_AND_PUSH_PROMPT: &str = "Commit and push all changes";

/// The message behind "Commit and push".
pub fn commit_and_push_prompt() -> &'static str {
    COMMIT_AND_PUSH_PROMPT
}

/// Whether `git config --get pull.rebase` asks for rebasing: `merges`,
/// `interactive`, `preserve`, or a true boolean, case-insensitive, as the
/// reference reads it (index @ ~3,229,742).
pub fn pull_rebase_enabled(config_value: Option<&str>) -> bool {
    let v = config_value.unwrap_or("").trim().to_ascii_lowercase();
    matches!(
        v.as_str(),
        "merges" | "interactive" | "preserve" | "true" | "yes" | "on" | "1"
    )
}

/// Inputs for the resolve-merge-conflicts message.
#[derive(Debug, Clone, Default)]
pub struct ResolveConflictsRequest<'a> {
    /// The branch the PR merges into (its base, else the workspace's target).
    pub target_branch: &'a str,
    /// The workspace's `pull.rebase` asks for rebasing.
    pub use_rebase: bool,
    /// Repository setting `custom_prompt_resolve_merge_conflicts`.
    pub custom_instructions: Option<&'a str>,
}

/// Build the message "Resolve" (header, merge conflicts) sends to the agent.
/// As in the reference (index `E5e` @ ~597,800 and `vue` @ ~2,506,500):
/// rebase onto or merge the remote target branch per `pull.rebase`, resolve
/// the conflicts, then push (`--force-with-lease` after a rebase), followed
/// by the repository's custom instructions, which win. Wording is ours.
pub fn resolve_merge_conflicts_prompt(r: &ResolveConflictsRequest) -> String {
    let target = r.target_branch;
    let mut out = if r.use_rebase {
        format!(
            "This branch's PR has merge conflicts with `{target}`. Rebase this branch onto the remote `{target}` and resolve the conflicts. Stage each resolved file and run `git rebase --continue` until the rebase finishes, then push with `git push --force-with-lease`."
        )
    } else {
        format!(
            "This branch's PR has merge conflicts with `{target}`. Merge the remote `{target}` into this branch and resolve the conflicts, then commit the merge and push."
        )
    };
    out.push_str(" If a conflict needs a decision only the user can make, stop and ask.");
    if let Some(c) = present(r.custom_instructions) {
        out.push_str(&format!(
            "\n\n## Repository instructions\n\nThese come from the repository's settings and take precedence over the steps above:\n\n{}",
            c.trim()
        ));
    }
    out
}
