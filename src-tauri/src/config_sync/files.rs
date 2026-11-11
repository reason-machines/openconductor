use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use super::{valid_name, Category, CategoryDiff, Checked, Direction, Selection};

const IO_ERROR: &str = "Cannot access local config files.";
const UNSAFE_PATH: &str = "Config path is not a regular home-owned path.";
const OCCUPIED: &str = "Destination already exists. Refresh the config diff.";
static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
struct Inventory {
    available: BTreeMap<String, PathBuf>,
    occupied: BTreeSet<String>,
}

fn roots(category: Category) -> (&'static str, &'static str) {
    match category {
        Category::Skills => (".claude/skills", ".codex/skills"),
        Category::SlashCommands => (".claude/commands", ".codex/prompts"),
        Category::McpServers => unreachable!(),
    }
}

fn directory(home: &Path, relative: &Path) -> Checked<bool> {
    match checked(home, relative)? {
        Some(meta) if meta.is_dir() => Ok(true),
        Some(_) => Err(UNSAFE_PATH),
        None => Ok(false),
    }
}

pub(super) fn checked(home: &Path, relative: &Path) -> Checked<Option<Metadata>> {
    if !home.is_absolute()
        || relative.as_os_str().is_empty()
        || relative.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(UNSAFE_PATH);
    }
    let home_meta = fs::symlink_metadata(home).map_err(|_| IO_ERROR)?;
    if home_meta.file_type().is_symlink() || !home_meta.is_dir() {
        return Err(UNSAFE_PATH);
    }
    let components: Vec<_> = relative.components().collect();
    let mut current = home.to_path_buf();
    for (index, component) in components.iter().enumerate() {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(meta) => {
                if meta.file_type().is_symlink()
                    || (index + 1 < components.len() && !meta.is_dir())
                {
                    return Err(UNSAFE_PATH);
                }
                if index + 1 == components.len() {
                    return Ok(Some(meta));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(IO_ERROR),
        }
    }
    Err(UNSAFE_PATH)
}

#[cfg(unix)]
fn same_file(left: &Metadata, right: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    left.dev() == right.dev() && left.ino() == right.ino()
}

#[cfg(not(unix))]
fn same_file(left: &Metadata, right: &Metadata) -> bool {
    left.is_file() == right.is_file()
        && left.len() == right.len()
        && left.modified().ok() == right.modified().ok()
}

fn read_file(home: &Path, relative: &Path) -> Checked<Vec<u8>> {
    let before = checked(home, relative)?.ok_or(IO_ERROR)?;
    if !before.is_file() {
        return Err(UNSAFE_PATH);
    }
    let mut file = File::open(home.join(relative)).map_err(|_| IO_ERROR)?;
    let opened = file.metadata().map_err(|_| IO_ERROR)?;
    let current = checked(home, relative)?.ok_or(UNSAFE_PATH)?;
    if !opened.is_file() || !same_file(&before, &opened) || !same_file(&opened, &current) {
        return Err(UNSAFE_PATH);
    }
    let mut data = Vec::new();
    file.read_to_end(&mut data).map_err(|_| IO_ERROR)?;
    Ok(data)
}

pub(super) fn read_optional(home: &Path, relative: &Path) -> Checked<Option<String>> {
    if checked(home, relative)?.is_none() {
        return Ok(None);
    }
    let data = read_file(home, relative)?;
    String::from_utf8(data).map(Some).map_err(|_| "Config file is not valid UTF-8.")
}

fn scan(home: &Path, root: &str, category: Category) -> Checked<Inventory> {
    let mut inventory = Inventory::default();
    if !directory(home, Path::new(root))? {
        return Ok(inventory);
    }
    if category == Category::SlashCommands {
        scan_commands(home, Path::new(root), "", &mut inventory)?;
        return Ok(inventory);
    }
    for entry in fs::read_dir(home.join(root)).map_err(|_| IO_ERROR)? {
        let entry = entry.map_err(|_| IO_ERROR)?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !valid_name(category, name) {
            continue;
        }
        inventory.occupied.insert(name.into());
        let relative = Path::new(root).join(name);
        let kind = entry.file_type().map_err(|_| IO_ERROR)?;
        if kind.is_dir() {
            if let Ok(Some(meta)) = checked(home, &relative.join("SKILL.md")) {
                if meta.is_file() {
                    inventory.available.insert(name.into(), relative);
                }
            }
        }
    }
    Ok(inventory)
}

fn scan_commands(home: &Path, root: &Path, subdir: &str, out: &mut Inventory) -> Checked<()> {
    let relative = root.join(subdir);
    if !directory(home, &relative)? {
        return Ok(());
    }
    for entry in fs::read_dir(home.join(&relative)).map_err(|_| IO_ERROR)? {
        let entry = entry.map_err(|_| IO_ERROR)?;
        let filename = entry.file_name();
        let Some(filename) = filename.to_str() else { continue };
        if filename.starts_with('.') {
            continue;
        }
        let name = if subdir.is_empty() {
            filename.to_owned()
        } else {
            format!("{subdir}/{filename}")
        };
        let kind = entry.file_type().map_err(|_| IO_ERROR)?;
        if filename.to_ascii_lowercase().ends_with(".md") {
            let stem = &name[..name.len() - 3];
            if valid_name(Category::SlashCommands, stem) {
                let first = out.occupied.insert(stem.into());
                if first && kind.is_file() {
                    out.available.insert(stem.into(), root.join(&name));
                } else {
                    out.available.remove(stem);
                }
            }
        }
        if kind.is_dir() && valid_name(Category::SlashCommands, &name) {
            scan_commands(home, root, &name, out)?;
        }
    }
    Ok(())
}

fn destination(root: &str, category: Category, name: &str) -> PathBuf {
    Path::new(root).join(match category {
        Category::Skills => name.to_owned(),
        Category::SlashCommands => format!("{name}.md"),
        Category::McpServers => unreachable!(),
    })
}

fn missing(home: &Path, source: &Inventory, target: &Inventory, root: &str, category: Category) -> Vec<String> {
    source.available.keys().filter(|name| {
        !target.occupied.contains(*name)
            && matches!(checked(home, &destination(root, category, name)), Ok(None))
    }).cloned().collect()
}

pub(super) fn diff(home: &Path, category: Category) -> Checked<CategoryDiff> {
    let (cc_root, codex_root) = roots(category);
    let cc = scan(home, cc_root, category)?;
    let codex = scan(home, codex_root, category)?;
    Ok(CategoryDiff {
        cc_to_codex: missing(home, &cc, &codex, codex_root, category),
        codex_to_cc: missing(home, &codex, &cc, cc_root, category),
        error: None,
    })
}

fn ensure_dirs(home: &Path, relative: &Path) -> Checked<()> {
    let mut path = PathBuf::new();
    for component in relative.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(UNSAFE_PATH);
        }
        path.push(component.as_os_str());
        if checked(home, &path)?.is_none() {
            let mut builder = fs::DirBuilder::new();
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            match builder.create(home.join(&path)) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(_) => return Err(IO_ERROR),
            }
        }
        if !directory(home, &path)? {
            return Err(UNSAFE_PATH);
        }
    }
    Ok(())
}

struct Created {
    path: PathBuf,
    meta: Metadata,
}

fn rollback(home: &Path, created: &[Created]) {
    for entry in created.iter().rev() {
        if let Ok(Some(current)) = checked(home, &entry.path) {
            if same_file(&entry.meta, &current) {
                if current.is_dir() {
                    let _ = fs::remove_dir(home.join(&entry.path));
                } else if current.is_file() {
                    let _ = fs::remove_file(home.join(&entry.path));
                }
            }
        }
    }
}

fn write_new(home: &Path, relative: &Path, bytes: &[u8], created: &mut Vec<Created>) -> Checked<()> {
    if checked(home, relative)?.is_some() {
        return Err(OCCUPIED);
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(home.join(relative)).map_err(|_| IO_ERROR)?;
    created.push(Created {
        path: relative.to_path_buf(),
        meta: file.metadata().map_err(|_| IO_ERROR)?,
    });
    file.write_all(bytes).map_err(|_| IO_ERROR)?;
    file.sync_all().map_err(|_| IO_ERROR)
}

fn copy_tree(home: &Path, source: &Path, dest: &Path, frontmatter: Option<&str>, created: &mut Vec<Created>) -> Checked<()> {
    if !directory(home, source)? || !directory(home, dest)? {
        return Err(IO_ERROR);
    }
    for entry in fs::read_dir(home.join(source)).map_err(|_| IO_ERROR)? {
        let entry = entry.map_err(|_| IO_ERROR)?;
        let name = entry.file_name();
        if name == ".git" || name == "node_modules" || name == ".DS_Store" {
            continue;
        }
        let src = source.join(&name);
        let dst = dest.join(&name);
        let meta = checked(home, &src)?.ok_or(IO_ERROR)?;
        if meta.is_dir() {
            if checked(home, &dst)?.is_some() {
                return Err(OCCUPIED);
            }
            fs::create_dir(home.join(&dst)).map_err(|_| IO_ERROR)?;
            created.push(Created { path: dst.clone(), meta: checked(home, &dst)?.ok_or(IO_ERROR)? });
            copy_tree(home, &src, &dst, None, created)?;
        } else if meta.is_file() {
            let mut bytes = read_file(home, &src)?;
            if name == "SKILL.md" {
                if let Some(skill_name) = frontmatter {
                    let text = std::str::from_utf8(&bytes).map_err(|_| "Skill document is not valid UTF-8.")?;
                    if !text.strip_prefix('\u{feff}').unwrap_or(text).trim_start().starts_with("---") {
                        bytes = format!("---\nname: '{}'\ndescription: Imported from Claude Code\n---\n\n{text}", skill_name.replace('\'', "''")).into_bytes();
                    }
                }
            }
            write_new(home, &dst, &bytes, created)?;
        } else {
            return Err(UNSAFE_PATH);
        }
    }
    Ok(())
}

pub(super) fn apply(home: &Path, selection: &Selection) -> Checked<()> {
    let (cc_root, codex_root) = roots(selection.category);
    let (source_root, target_root) = match selection.direction {
        Direction::CcToCodex => (cc_root, codex_root),
        Direction::CodexToCc => (codex_root, cc_root),
    };
    let source = scan(home, source_root, selection.category)?;
    let target = scan(home, target_root, selection.category)?;
    if !missing(home, &source, &target, target_root, selection.category).contains(&selection.name) {
        return Err(OCCUPIED);
    }
    let src = source.available.get(&selection.name).ok_or("Source is no longer available.")?;
    let dst = destination(target_root, selection.category, &selection.name);
    ensure_dirs(home, dst.parent().ok_or(UNSAFE_PATH)?)?;
    if checked(home, &dst)?.is_some() {
        return Err(OCCUPIED);
    }
    let mut created = Vec::new();
    let outcome = if selection.category == Category::Skills {
        fs::create_dir(home.join(&dst)).map_err(|_| IO_ERROR)?;
        created.push(Created { path: dst.clone(), meta: checked(home, &dst)?.ok_or(IO_ERROR)? });
        let frontmatter = (selection.direction == Direction::CcToCodex).then_some(selection.name.as_str());
        copy_tree(home, src, &dst, frontmatter, &mut created)
    } else {
        let bytes = read_file(home, src)?;
        write_new(home, &dst, &bytes, &mut created)
    };
    if outcome.is_err() {
        rollback(home, &created);
    }
    outcome
}

pub(super) fn replace_config(home: &Path, relative: &Path, expected: Option<&str>, content: &str) -> Checked<()> {
    let parent = relative.parent().ok_or(UNSAFE_PATH)?;
    ensure_dirs(home, parent)?;
    let temporary = parent.join(format!(".openconductor-config-sync-{}-{}.tmp", std::process::id(), NEXT_TEMP.fetch_add(1, Ordering::Relaxed)));
    let mut created = Vec::new();
    let outcome = (|| {
        write_new(home, &temporary, content.as_bytes(), &mut created)?;
        if read_optional(home, relative)?.as_deref() != expected {
            return Err("Config changed during sync. Refresh the config diff.");
        }
        if expected.is_none() {
            fs::hard_link(home.join(&temporary), home.join(relative)).map_err(|_| OCCUPIED)?;
        } else {
            fs::rename(home.join(&temporary), home.join(relative)).map_err(|_| IO_ERROR)?;
        }
        Ok(())
    })();
    rollback(home, &created);
    outcome
}
