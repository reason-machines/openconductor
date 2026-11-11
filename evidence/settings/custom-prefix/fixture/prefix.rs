#[path = "naming.rs"]
mod naming;

#[test]
fn custom_prefix_delimiters_are_preserved() {
    for (prefix, expected) in [("myname-", "myname-tokyo"), ("team_", "team_tokyo"), ("team/ui-", "team/ui-tokyo"), ("feature/", "feature/tokyo"), ("team", "team/tokyo")] {
        assert_eq!(naming::branch_for(Some(prefix), "tokyo"), expected, "{prefix}");
    }
}
