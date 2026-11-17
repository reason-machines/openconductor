use crate::{agent::{PermissionMode, claude_stream::ClientMessage}, interact::Answer};
use serde_json::{json, Value};

fn reply(tool: &str, input: &Value, answer: &Answer, target: Option<PermissionMode>) -> Value {
    let decision = crate::reply_decision(tool, input, answer, target).unwrap();
    ClientMessage::PermissionReply { request_id: "plan-request".into(), decision }.to_json()["response"]["response"].clone()
}
#[test]
fn protocol_approved_plan_restores_auto_in_same_reply() {
    let got = reply("ExitPlanMode", &json!({"plan":"approved plan"}), &Answer::Plan { approved:true, feedback:None }, Some(PermissionMode::Auto));
    assert_eq!(got, json!({"behavior":"allow","updatedInput":{"plan":"approved plan","_targetMode":"auto"},"updatedPermissions":[{"type":"setMode","mode":"auto","destination":"session"}]}));
}
#[test]
fn protocol_approved_plan_restores_non_auto_policy() {
    for mode in [PermissionMode::Default, PermissionMode::BypassPermissions] {
        let got = reply("ExitPlanMode", &json!({"plan":"approved plan"}), &Answer::Plan { approved:true, feedback:None }, Some(mode));
        assert_eq!(got["updatedInput"]["_targetMode"], mode.as_str());
        assert_eq!(got["updatedPermissions"], json!([{"type":"setMode","mode":mode.as_str(),"destination":"session"}]));
    }
}
#[test]
fn protocol_denied_cancelled_and_ordinary_tools_never_change_mode() {
    for answer in [Answer::Plan { approved:false, feedback:None }, Answer::Cancel] {
        let got = reply("ExitPlanMode", &json!({"plan":"no"}), &answer, Some(PermissionMode::Auto));
        assert_eq!(got["behavior"], "deny");
        assert!(got.get("updatedPermissions").is_none());
    }
    let input = json!({"command":"synthetic command"});
    assert_eq!(reply("Bash", &input, &Answer::Option("allow".into()), Some(PermissionMode::Auto)), json!({"behavior":"allow","updatedInput":input}));
}
#[test]
fn protocol_absent_mode_preserves_legacy_reply() {
    let input = json!({"plan":"plan"});
    assert_eq!(reply("ExitPlanMode", &input, &Answer::Plan { approved:true, feedback:None }, None),json!({"behavior":"allow","updatedInput":input}));
}
