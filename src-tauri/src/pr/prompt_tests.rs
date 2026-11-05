use super::prompt::{create_pr_prompt, should_archive_after_merge, CreatePrRequest};

fn base() -> CreatePrRequest<'static> {
    CreatePrRequest {
        branch: "feat/x",
        remote: "origin",
        target_branch: "main",
        ..Default::default()
    }
}

#[test]
fn default_prompt_has_ordered_steps_and_limits() {
    let p = create_pr_prompt(&base());
    assert!(p.contains("wants a pull request"));
    assert!(p.contains("Current branch: feat/x\nTarget: origin/main"));
    let order = [
        "skill",
        "`git status`",
        "`git push -u origin HEAD`",
        "`git diff origin/main...`",
        "`gh pr create --base main`",
    ];
    let pos: Vec<usize> = order
        .iter()
        .map(|s| p.find(s).unwrap_or_else(|| panic!("missing {s}")))
        .collect();
    assert!(
        pos.windows(2).all(|w| w[0] < w[1]),
        "steps out of order: {pos:?}"
    );
    assert!(p.contains("at most 80 characters"));
    assert!(p.contains("five sentences"));
    assert!(p.contains("ask the user"));
    assert!(!p.contains("--draft"));
    assert!(!p.contains("## "));
}

#[test]
fn draft_and_diff_tool() {
    let p = create_pr_prompt(&CreatePrRequest {
        draft: true,
        diff_tool: Some("workspace_diff"),
        ..base()
    });
    assert!(p.contains("wants a draft pull request"));
    assert!(p.contains("`gh pr create --base main --draft`"));
    assert!(p.contains("`workspace_diff` tool"));
    assert!(!p.contains("git diff origin/main..."));
}

#[test]
fn user_title_and_description_are_used_verbatim() {
    let r = CreatePrRequest {
        title: Some("Fix login"),
        description: Some("Line one\nLine two"),
        template: Some("## Summary"),
        ..base()
    };
    let p = create_pr_prompt(&r);
    assert!(p.contains("--title <title> --body <description>`"));
    assert!(p.ends_with("## Description\n\nUse this description exactly:\nLine one\nLine two"));
    assert!(p.contains("## Title\n\nUse this title exactly:\nFix login"));
    assert!(!p.contains("80 characters") && !p.contains("five sentences"));
    assert!(
        !p.contains("template"),
        "template ignored when a description is given"
    );
}

#[test]
fn template_and_custom_instructions() {
    let r = CreatePrRequest {
        title: Some("   "),
        template: Some("## Summary\n\n## Test plan"),
        custom_instructions: Some("  Link the Linear issue.\n"),
        ..base()
    };
    let p = create_pr_prompt(&r);
    assert!(
        p.contains("at most 80 characters"),
        "blank title counts as none"
    );
    assert!(p.contains("```markdown\n## Summary\n\n## Test plan\n```"));
    assert!(p.ends_with("take precedence over the steps above:\n\nLink the Linear issue."));
}

#[test]
fn archive_on_merge_rule() {
    assert!(should_archive_after_merge(Some("true"), false, false));
    assert!(!should_archive_after_merge(Some("false"), false, false));
    assert!(!should_archive_after_merge(Some("TRUE"), false, false));
    assert!(!should_archive_after_merge(None, false, false));
    assert!(
        !should_archive_after_merge(Some("true"), true, false),
        "cloud workspaces"
    );
    assert!(
        !should_archive_after_merge(Some("true"), false, true),
        "already archived"
    );
}
