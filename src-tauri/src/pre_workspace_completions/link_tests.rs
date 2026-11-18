//! Assertions using the existing Codex skill_links parser verbatim (mounted
//! by run-tests.py); excluded from full-app tests where that parser already
//! has its own unit tests and does not need a second top-level export.
use super::*;

#[test]
fn persisted_selected_ref_skill_path_is_consumed_by_actual_skill_links_grammar() {
    let f = fixture();
    let c = run(&f, "first", "codex").unwrap();
    let skill = deploy(&c);
    let (text, skills) = crate::skill_links(&format!("Use [${}]({}) now", skill.name, skill.path));
    assert_eq!(text, "Use $deploy now");
    assert_eq!(skills, vec![("deploy".into(), skill.path.clone())]);
    assert!(fs::read_to_string(&skills[0].1)
        .unwrap()
        .contains("first Codex"));
}
