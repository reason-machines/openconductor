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
