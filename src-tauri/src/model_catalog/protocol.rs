use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LocalAgent {
    Claude,
    Codex,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogModel {
    pub agent: LocalAgent,
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub efforts: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_effort: Option<String>,
}

fn text(value: &Value, field: &str) -> Result<String, String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("Model catalog entry has no {field}"))
}

fn efforts(values: impl Iterator<Item = String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    values
        .filter(|s| !s.is_empty() && seen.insert(s.clone()))
        .collect()
}

fn finish(models: Vec<CatalogModel>) -> Result<Vec<CatalogModel>, String> {
    let mut seen = BTreeSet::new();
    let models: Vec<_> = models
        .into_iter()
        .filter(|m| seen.insert(m.id.clone()))
        .collect();
    if models.is_empty() {
        Err("The agent advertised no models".into())
    } else {
        Ok(models)
    }
}

pub fn claude_initialize() -> String {
    format!(
        "{}\n",
        json!({"type":"control_request","request_id":"oc-models","request":{"subtype":"initialize"}})
    )
}

pub fn claude_models(line: &Value) -> Option<Result<Vec<CatalogModel>, String>> {
    if line.get("type").and_then(Value::as_str) != Some("control_response")
        || line.pointer("/response/request_id").and_then(Value::as_str) != Some("oc-models")
    {
        return None;
    }
    Some((|| {
        if line.pointer("/response/subtype").and_then(Value::as_str) != Some("success") {
            return Err("Claude Code model initialization failed".into());
        }
        let models = line
            .pointer("/response/response/models")
            .and_then(Value::as_array)
            .ok_or(
                "Claude Code did not advertise supportedModels metadata; update the local CLI",
            )?;
        let parsed = models
            .iter()
            .map(|m| {
                let levels = match m.get("supportedEffortLevels") {
                    None | Some(Value::Null) => None,
                    Some(Value::Array(levels)) => Some(efforts(
                        levels
                            .iter()
                            .map(|v| {
                                v.as_str()
                                    .map(str::to_owned)
                                    .ok_or("Claude Code returned invalid effort metadata")
                            })
                            .collect::<Result<Vec<_>, _>>()?
                            .into_iter(),
                    )),
                    _ => return Err("Claude Code returned invalid effort metadata".into()),
                };
                Ok(CatalogModel {
                    agent: LocalAgent::Claude,
                    id: text(m, "value")?,
                    name: text(m, "displayName")?,
                    efforts: if m.get("supportsEffort").and_then(Value::as_bool) == Some(false) {
                        None
                    } else {
                        levels
                    },
                    default_effort: None,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        finish(parsed)
    })())
}

#[derive(Default)]
pub struct CodexCatalog {
    initialized: bool,
    request_id: u64,
    requests: Vec<String>,
    cursors: BTreeSet<String>,
    models: Vec<CatalogModel>,
}

impl CodexCatalog {
    pub fn initialize() -> String {
        format!(
            "{}\n",
            json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"openconductor-models","version":env!("CARGO_PKG_VERSION")}}})
        )
    }

    fn list(&mut self, cursor: Option<&str>) {
        self.request_id += 1;
        self.requests.push(format!("{}\n", json!({"id":self.request_id,"method":"model/list","params":{"limit":100,"cursor":cursor}})));
    }

    pub fn take_requests(&mut self) -> Vec<String> {
        std::mem::take(&mut self.requests)
    }

    pub fn accept(&mut self, line: &Value) -> Option<Result<Vec<CatalogModel>, String>> {
        let expected_id = if self.initialized { self.request_id } else { 1 };
        if line.get("id").and_then(Value::as_u64) != Some(expected_id) {
            return None;
        }
        if line.get("error").is_some() {
            return Some(Err(if self.initialized {
                "Codex model/list failed"
            } else {
                "Codex initialization failed"
            }
            .into()));
        }
        let Some(result) = line.get("result").filter(|v| v.is_object()) else {
            return Some(Err("Codex returned an invalid catalog response".into()));
        };
        if !self.initialized {
            self.initialized = true;
            self.request_id = 1;
            self.requests
                .push(format!("{}\n", json!({"method":"initialized"})));
            self.list(None);
            return None;
        }
        match self.page(result) {
            Ok(Some(models)) => Some(Ok(models)),
            Ok(None) => None,
            Err(error) => Some(Err(error)),
        }
    }

    fn page(&mut self, result: &Value) -> Result<Option<Vec<CatalogModel>>, String> {
        let data = result
            .get("data")
            .and_then(Value::as_array)
            .ok_or("Codex returned no model/list data")?;
        for model in data {
            if model.get("hidden").and_then(Value::as_bool) == Some(true) {
                continue;
            }
            let levels = model
                .get("supportedReasoningEfforts")
                .and_then(Value::as_array)
                .ok_or("Codex returned no supported reasoning efforts")?;
            let levels = efforts(
                levels
                    .iter()
                    .map(|v| text(v, "reasoningEffort"))
                    .collect::<Result<Vec<_>, _>>()?
                    .into_iter(),
            );
            let default_effort = match model.get("defaultReasoningEffort") {
                None | Some(Value::Null) => None,
                Some(Value::String(value)) if levels.contains(value) => Some(value.clone()),
                _ => return Err("Codex returned an invalid default reasoning effort".into()),
            };
            self.models.push(CatalogModel {
                agent: LocalAgent::Codex,
                id: text(model, "model")?,
                name: text(model, "displayName")?,
                efforts: Some(levels),
                default_effort,
            });
        }
        match result.get("nextCursor") {
            None | Some(Value::Null) => finish(std::mem::take(&mut self.models)).map(Some),
            Some(Value::String(cursor))
                if !cursor.is_empty() && self.cursors.insert(cursor.clone()) =>
            {
                self.list(Some(cursor));
                Ok(None)
            }
            _ => Err("Codex returned an invalid or repeated model catalog cursor".into()),
        }
    }
}

#[cfg(test)]
mod tests;
