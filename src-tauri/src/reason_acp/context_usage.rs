//! Latest context occupancy, deliberately separate from cumulative turn Usage.
//!
//! The retained Conductor `Doe`/`oct` functions select top-level Claude
//! assistant usage (four token components), ignore zero samples, reset at a
//! compact boundary, and take only denominators from result.modelUsage.
//! No result token totals, inferred window sizes, or Reason ACP producer.

use serde::Serialize;
use serde_json::Value;

/// Largest integer the JavaScript consumer can represent without rounding.
pub const MAX_SAFE_TOKENS: u64 = 9_007_199_254_740_991;

/// A latest sample, a model-specific denominator, or a compaction reset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ContextUpdate {
    Sample {
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        input_tokens: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_read_input_tokens: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_creation_input_tokens: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        output_tokens: Option<u64>,
        /// Only a producer's explicit latest total, never a cumulative total.
        #[serde(skip_serializing_if = "Option::is_none")]
        total_tokens: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        context_window: Option<u64>,
    },
    Window {
        model: String,
        context_window: u64,
    },
    Reset,
}

/// Natural, JavaScript-safe integer. Strings, fractions and negatives fail.
fn natural(value: &Value) -> Option<u64> {
    value.as_u64().filter(|n| *n <= MAX_SAFE_TOKENS)
}

/// The parser retains the outer parent id: nested agent samples must not be
/// mistaken for the chat's context. Missing and null mean top-level; other
/// values (including malformed nonstrings) do not.
pub fn claude_sample(message: &Value, parent_tool_use_id: &Value) -> Option<ContextUpdate> {
    if !parent_tool_use_id.is_null() {
        return None;
    }
    let usage = message.get("usage")?.as_object()?;
    let token = |key: &str| usage.get(key).and_then(natural);
    let input_tokens = token("input_tokens");
    let cache_read_input_tokens = token("cache_read_input_tokens");
    let cache_creation_input_tokens = token("cache_creation_input_tokens");
    let output_tokens = token("output_tokens");
    let total = [
        input_tokens,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        output_tokens,
    ]
    .into_iter()
    .try_fold(0_u64, |sum, value| sum.checked_add(value.unwrap_or(0)))?;
    if total == 0 || total > MAX_SAFE_TOKENS {
        return None;
    }
    Some(ContextUpdate::Sample {
        model: message
            .get("model")
            .and_then(Value::as_str)
            .map(str::to_owned),
        input_tokens,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        output_tokens,
        // Claude's four components, not a precomputed/cumulative total.
        total_tokens: None,
        context_window: None,
    })
}

/// Only valid model denominators from a result, never result token usage.
pub fn claude_windows(model_usage: &Value) -> Vec<ContextUpdate> {
    let Some(models) = model_usage.as_object() else {
        return Vec::new();
    };
    models
        .iter()
        .filter_map(|(model, usage)| {
            let context_window = natural(usage.get("contextWindow")?).filter(|n| *n > 0)?;
            Some(ContextUpdate::Window {
                model: model.clone(),
                context_window,
            })
        })
        .collect()
}

/// Codex 0.166's documented `thread/tokenUsage/updated` params. Only the
/// explicit latest total is occupancy: `total` is cumulative, cached input
/// is contained in input, and reasoning output is contained in output.
/// Do not synthesize a total or expose overlapping components to a reducer.
/// Schema: openai/codex@rust-v0.166.0,
/// app-server-protocol/schema/typescript/v2/ThreadTokenUsage.ts and
/// ThreadTokenUsageUpdatedNotification.ts.
pub fn codex_sample(params: &Value) -> Option<ContextUpdate> {
    params.get("threadId")?.as_str()?;
    params.get("turnId")?.as_str()?;
    let usage = params.get("tokenUsage")?;
    let total_tokens = natural(usage.get("last")?.get("totalTokens")?)?;
    let context_window = usage
        .get("modelContextWindow")
        .and_then(natural)
        .filter(|n| *n > 0);
    Some(ContextUpdate::Sample {
        model: None,
        input_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        output_tokens: None,
        total_tokens: Some(total_tokens),
        context_window,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_only_safe_natural_numbers() {
        for value in [
            json!(-1),
            json!(0.25),
            json!("10"),
            json!(null),
            json!(true),
            json!(MAX_SAFE_TOKENS + 1),
        ] {
            assert_eq!(natural(&value), None, "{value}");
        }
        assert_eq!(natural(&json!(0)), Some(0));
        assert_eq!(natural(&json!(MAX_SAFE_TOKENS)), Some(MAX_SAFE_TOKENS));
    }

    #[test]
    fn reset_has_no_extraneous_fields() {
        assert_eq!(
            serde_json::to_value(ContextUpdate::Reset).unwrap(),
            json!({"kind":"reset"})
        );
    }

    #[test]
    fn invalid_or_missing_windows_are_not_inferred() {
        for usage in [
            json!(null),
            json!([]),
            json!({}),
            json!({"m":{"contextWindow":0}}),
            json!({"m":{"contextWindow":"200000"}}),
        ] {
            assert!(claude_windows(&usage).is_empty());
        }
    }
}
