// Conductor's icon set for file trees, file lists and workspace rows. Screen
// nodes import from here:
//   <FileTypeIcon path="scripts/setup.sh" />   any file, by name (material icons)
//   <FolderTypeIcon open={expanded} />          folders
//   <BranchIcon />                              workspace branch glyph
// plus the named file-type icons below. File and folder icons are the material
// icon SVGs Conductor ships (see fileIcons.ts); the branch glyph is the
// "branch" shape from Conductor's sidebar status table (REA, RowStatusIcon.tsx),
// which is Lucide's git-branch, re-exported from the shared set in Icons.tsx.
import { fileIconName, folderIconName, materialIconUrl, type MaterialIcon } from "./fileIcons";

type IconProps = { size?: number; className?: string };

/** One material icon by name. Decorative: the row's text names the file. */
export function MaterialIconImg({ name, size = 16, className }: IconProps & { name: MaterialIcon }) {
  return (
    <img
      src={materialIconUrl(name)}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      data-icon={name}
      className={className ? `oc-file-icon ${className}` : "oc-file-icon"}
      style={{ flex: "none", display: "block" }}
    />
  );
}

/** The file-type icon for a path, chosen the way Conductor chooses it. */
export const FileTypeIcon = ({ path, ...p }: IconProps & { path: string }) => <MaterialIconImg name={fileIconName(path)} {...p} />;

/** Folder icon; `open` while the folder is expanded. */
export const FolderTypeIcon = ({ open = false, ...p }: IconProps & { open?: boolean }) => <MaterialIconImg name={folderIconName(open)} {...p} />;

export const GitFileIcon = (p: IconProps) => <MaterialIconImg name="git" {...p} />;
export const PythonFileIcon = (p: IconProps) => <MaterialIconImg name="python" {...p} />;
export const MarkdownFileIcon = (p: IconProps) => <MaterialIconImg name="markdown" {...p} />;
export const ShellFileIcon = (p: IconProps) => <MaterialIconImg name="console" {...p} />;
export const JavaScriptFileIcon = (p: IconProps) => <MaterialIconImg name="javascript" {...p} />;
export const TypeScriptFileIcon = (p: IconProps) => <MaterialIconImg name="typescript" {...p} />;
export const JsonFileIcon = (p: IconProps) => <MaterialIconImg name="json" {...p} />;
export const GenericFileIcon = (p: IconProps) => <MaterialIconImg name="file" {...p} />;

/** Conductor's workspace branch glyph (Lucide git-branch from the shared icon set). */
export { BranchIcon } from "./Icons";
