use super::*;

const MODIFY: &str = "\
diff --git a/src/main.rs b/src/main.rs
index 83db48f..bf269f4 100644
--- a/src/main.rs
+++ b/src/main.rs
@@ -1,4 +1,5 @@ fn main() {
 use std::io;
-fn old() {}
+fn new() {}
+fn extra() {}
 
 // end
";

#[test]
fn parses_modified_file_with_line_numbers() {
    let files = parse_unified(MODIFY).unwrap();
    assert_eq!(files.len(), 1);
    let f = &files[0];
    assert_eq!(f.path, "src/main.rs");
    assert_eq!(f.old_path, None);
    assert_eq!(f.status, FileStatus::Modified);
    assert_eq!((f.additions, f.deletions), (2, 1));
    let h = &f.hunks[0];
    assert_eq!(
        (h.old_start, h.old_lines, h.new_start, h.new_lines),
        (1, 4, 1, 5)
    );
    assert_eq!(h.section, "fn main() {");
    let nums: Vec<_> = h
        .lines
        .iter()
        .map(|l| (l.kind, l.old_line, l.new_line))
        .collect();
    assert_eq!(
        nums,
        vec![
            (LineKind::Context, Some(1), Some(1)),
            (LineKind::Deletion, Some(2), None),
            (LineKind::Addition, None, Some(2)),
            (LineKind::Addition, None, Some(3)),
            (LineKind::Context, Some(3), Some(4)),
            (LineKind::Context, Some(4), Some(5)),
        ]
    );
    assert_eq!(h.lines[2].text, "fn new() {}");
    assert_eq!(h.lines[4].text, "");
}

#[test]
fn hunk_content_that_looks_like_headers_stays_content() {
    let patch = "\
diff --git a/a.md b/a.md
--- a/a.md
+++ b/a.md
@@ -1,2 +1,2 @@
--- old rule
+++ new rule
 diff --git inside text
";
    let f = &parse_unified(patch).unwrap()[0];
    let texts: Vec<_> = f.hunks[0]
        .lines
        .iter()
        .map(|l| (l.kind, l.text.as_str()))
        .collect();
    assert_eq!(
        texts,
        vec![
            (LineKind::Deletion, "-- old rule"),
            (LineKind::Addition, "++ new rule"),
            (LineKind::Context, "diff --git inside text"),
        ]
    );
}

#[test]
fn added_deleted_and_missing_counts() {
    let patch = "\
diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+hello
\\ No newline at end of file
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-a
-b
";
    let files = parse_unified(patch).unwrap();
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].status, FileStatus::Added);
    assert_eq!(files[0].path, "new.txt");
    assert_eq!(files[0].additions, 1);
    assert!(files[0].hunks[0].lines[0].no_newline_at_eof);
    assert_eq!(files[1].status, FileStatus::Deleted);
    assert_eq!(files[1].path, "gone.txt");
    assert_eq!(files[1].old_path, None);
    assert_eq!(files[1].deletions, 2);
}

#[test]
fn renames_binaries_and_mode_changes() {
    let patch = "\
diff --git a/old name.txt b/new name.txt
similarity index 100%
rename from old name.txt
rename to new name.txt
diff --git a/logo.png b/logo.png
index 1111111..2222222 100644
Binary files a/logo.png and b/logo.png differ
diff --git a/run me.sh b/run me.sh
old mode 100644
new mode 100755
diff --git a/link b/link
old mode 100644
new mode 120000
";
    let files = parse_unified(patch).unwrap();
    assert_eq!(files[0].status, FileStatus::Renamed);
    assert_eq!(files[0].old_path.as_deref(), Some("old name.txt"));
    assert_eq!(files[0].path, "new name.txt");
    assert!(files[1].binary);
    assert_eq!(files[1].path, "logo.png");
    assert_eq!(files[2].path, "run me.sh");
    assert_eq!(files[2].status, FileStatus::Modified);
    assert_eq!(files[2].old_path, None);
    assert_eq!(files[3].status, FileStatus::TypeChanged);
}

#[test]
fn quoted_paths_are_unquoted() {
    let patch = "\
diff --git \"a/caf\\303\\251 \\\"x\\\".txt\" \"b/caf\\303\\251 \\\"x\\\".txt\"
--- \"a/caf\\303\\251 \\\"x\\\".txt\"
+++ \"b/caf\\303\\251 \\\"x\\\".txt\"
@@ -1 +1 @@
-a
+b
";
    let f = &parse_unified(patch).unwrap()[0];
    assert_eq!(f.path, "caf\u{e9} \"x\".txt");
    assert_eq!(f.old_path, None);
}

#[test]
fn git_binary_patch_body_is_skipped() {
    let patch = "\
diff --git a/b.bin b/b.bin
new file mode 100644
GIT binary patch
literal 3
KcmZQzWMT#Y01f~L

literal 0
HcmV?d00001

diff --git a/c.txt b/c.txt
--- a/c.txt
+++ b/c.txt
@@ -1 +1 @@
-x
+y
";
    let files = parse_unified(patch).unwrap();
    assert_eq!(files.len(), 2);
    assert!(files[0].binary && files[0].hunks.is_empty());
    assert_eq!(files[1].additions, 1);
}

#[test]
fn truncated_hunk_is_an_error() {
    let patch = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n";
    let e = parse_unified(patch).unwrap_err();
    assert!(e.message.contains("ended inside a hunk"), "{e}");
}

#[test]
fn bad_marker_is_an_error() {
    let patch = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n?x\n";
    assert!(parse_unified(patch).is_err());
}

#[test]
fn empty_patch_has_no_files() {
    assert!(parse_unified("").unwrap().is_empty());
}

#[test]
fn trailing_tab_after_a_name_with_spaces_is_not_part_of_the_path() {
    // git writes "--- a/my file.txt\t" for names containing a space.
    let patch = "diff --git a/my file.txt b/my file.txt\n--- a/my file.txt\t\n+++ b/my file.txt\t\n@@ -1 +1 @@\n-a\n+b\n\
diff --git a/new file.rs b/new file.rs\nnew file mode 100644\n--- /dev/null\n+++ b/new file.rs\t\n@@ -0,0 +1 @@\n+x\n";
    let files = parse_unified(patch).unwrap();
    assert_eq!(files[0].path, "my file.txt");
    assert_eq!(files[0].old_path, None);
    assert_eq!(files[1].path, "new file.rs");
}
