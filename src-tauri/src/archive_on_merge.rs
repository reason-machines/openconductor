//! The repository override of `git.archive_on_merge`. Conductor reads the
//! key with `getSettingForRepo` (index-BGEQ8YjU.js @ ~668,515): it is a
//! workspace-configurable setting, so a repository's `.conductor/` settings
//! files (shared, local, managed) win over the user setting. Our user setting
//! lives in OpenConductor's own settings file, so this returns only what the
//! repository layers set; the frontend falls back to the user value.

use oc_scripts::config::{Layer, LayerSource};
use toml::Value;

fn as_bool(value: &Value) -> Option<bool> {
    match value {
        Value::Boolean(b) => Some(*b),
        Value::String(s) if s == "true" => Some(true),
        Value::String(s) if s == "false" => Some(false),
        _ => None,
    }
}

/// `[git] archive_on_merge` from the highest-precedence repository layer
/// that sets it (layers order by (format, layer), as everywhere else in the
/// settings files); `None` when no repository layer sets it.
pub fn repo_override(layers: &[LayerSource]) -> Option<bool> {
    let mut ordered: Vec<&LayerSource> = layers
        .iter()
        .filter(|l| !matches!(l.layer, Layer::Defaults | Layer::User))
        .collect();
    ordered.sort_by_key(|l| (l.format, l.layer));
    ordered.iter().rev().find_map(|l| {
        l.table
            .get("git")
            .and_then(Value::as_table)
            .and_then(|git| git.get("archive_on_merge"))
            .and_then(as_bool)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layer(layer: Layer, text: &str) -> LayerSource {
        LayerSource::from_toml(layer, format!("{layer:?}"), text).unwrap()
    }

    #[test]
    fn no_repository_layer_means_no_override() {
        assert_eq!(repo_override(&[]), None);
        let user = layer(Layer::User, "[git]\narchive_on_merge = true\n");
        assert_eq!(repo_override(&[user]), None);
        let other = layer(
            Layer::RepoShared,
            "[git]\ndelete_branch_on_archive = true\n",
        );
        assert_eq!(repo_override(&[other]), None);
    }

    #[test]
    fn the_highest_repository_layer_wins() {
        let shared = layer(Layer::RepoShared, "[git]\narchive_on_merge = true\n");
        let local = layer(Layer::RepoLocal, "[git]\narchive_on_merge = \"false\"\n");
        assert_eq!(repo_override(&[local.clone(), shared.clone()]), Some(false));
        assert_eq!(repo_override(&[shared]), Some(true));
        let managed = layer(Layer::Managed, "[git]\narchive_on_merge = true\n");
        assert_eq!(repo_override(&[local, managed]), Some(true));
    }

    #[test]
    fn a_value_that_is_not_a_boolean_is_ignored() {
        let local = layer(Layer::RepoLocal, "[git]\narchive_on_merge = 1\n");
        let shared = layer(Layer::RepoShared, "[git]\narchive_on_merge = false\n");
        assert_eq!(repo_override(&[local, shared]), Some(false));
    }
}
