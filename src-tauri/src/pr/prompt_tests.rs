use super::prompt::{
    commit_and_push_prompt, create_pr_prompt, pull_rebase_enabled, resolve_merge_conflicts_prompt,
    should_archive_after_merge, CreatePrRequest, ResolveConflictsRequest,
};

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

#[test]
fn commit_and_push_is_the_reference_instruction() {
    assert_eq!(commit_and_push_prompt(), "Commit and push all changes");
}

#[test]
fn pull_rebase_values_that_mean_rebase() {
    for v in [
        "true",
        "TRUE",
        "yes",
        "on",
        "1",
        "merges",
        "interactive",
        "preserve",
        " true\n",
    ] {
        assert!(pull_rebase_enabled(Some(v)), "{v:?}");
    }
    for v in ["false", "no", "0", "", "off", "nonsense"] {
        assert!(!pull_rebase_enabled(Some(v)), "{v:?}");
    }
    assert!(!pull_rebase_enabled(None), "unset means merge");
}

#[test]
fn resolve_conflicts_merges_or_rebases_per_pull_rebase() {
    let merge = resolve_merge_conflicts_prompt(&ResolveConflictsRequest {
        target_branch: "main",
        use_rebase: false,
        custom_instructions: None,
    });
    assert!(merge.contains("Merge the remote `main` into this branch"));
    assert!(merge.contains("commit the merge and push"));
    assert!(!merge.contains("rebase") && !merge.contains("force"));
    assert!(!merge.contains("Repository instructions"));

    let rebase = resolve_merge_conflicts_prompt(&ResolveConflictsRequest {
        target_branch: "release/1.2",
        use_rebase: true,
        custom_instructions: Some("   "),
    });
    assert!(rebase.contains("Rebase this branch onto the remote `release/1.2`"));
    assert!(rebase.contains("git rebase --continue"));
    assert!(rebase.contains("git push --force-with-lease"));
    assert!(
        !rebase.contains("Repository instructions"),
        "blank custom prompt is ignored"
    );
}

#[test]
fn resolve_conflicts_appends_repository_instructions_last() {
    let p = resolve_merge_conflicts_prompt(&ResolveConflictsRequest {
        target_branch: "main",
        use_rebase: false,
        custom_instructions: Some("  Prefer our side for lockfiles.\n"),
    });
    let (steps, custom) = p
        .split_once("## Repository instructions")
        .expect("custom section");
    assert!(steps.contains("Merge the remote `main`"));
    assert!(custom.ends_with("Prefer our side for lockfiles."));
}
