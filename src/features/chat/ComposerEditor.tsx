import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { UndoRedo } from "@tiptap/extensions";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { clipboardComposerParts, COMPOSER_CLIPBOARD, composerPrompt, writeComposerDraft } from "./composerDocument.ts";
import { FileAtom, composerContent, inlineContent, linearDocument, partsFrom } from "./composerSchema.ts";

export interface ComposerSelection { text: string; start: number; end: number }
export interface ComposerEditorHandle {
  focus(position?: "end"): void;
  blur(): void;
  visible(): boolean;
  focused(): boolean;
  composing(): boolean;
  atTop?(): boolean;
  selection(): ComposerSelection;
  replaceRange(range: { start: number; end: number }, text: string): boolean;
  insertFile(range: { start: number; end: number }, file: { path: string; label: string; directory: boolean }): void;
  deleteRange(range: { start: number; end: number }): boolean;
  newline(): void;
}

interface Props {
  value: string;
  inputRef: RefObject<ComposerEditorHandle>;
  placeholder: string;
  onChange(value: string): void;
  onSelection(selection: ComposerSelection): void;
  onKeyDown(event: KeyboardEvent): void;
  onFocus(): void;
  onBlur(): void;
  onPasteFiles(files: FileList): boolean;
  onInteraction?(): void;
}

function snapshot(editor: Editor): ComposerSelection {
  const { text, positions } = linearDocument(editor.state.doc);
  const offset = (position: number) => {
    const index = positions.findIndex((value) => value >= position);
    return index < 0 ? text.length : index;
  };
  return { text, start: offset(editor.state.selection.from), end: offset(editor.state.selection.to) };
}

export function ComposerEditor(props: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const instance = useRef<Editor | null>(null);
  const pending = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!mount.current) return;
    const emitSelection = () => current.current.onSelection(snapshot(editor));
    const editor = new Editor({
      element: mount.current,
      extensions: [Document, Paragraph, Text, HardBreak, FileAtom, UndoRedo],
      content: composerContent(current.current.value),
      enableInputRules: false, enablePasteRules: false,
      editorProps: {
        attributes: {
          role: "textbox", "aria-label": "Message", "aria-multiline": "true", "data-testid": "composer-input",
          spellcheck: "false",
          autocomplete: "new-password",
          autocorrect: "off",
          autocapitalize: "off",
          writingsuggestions: "false",
        },
        handleKeyDown: (_view, event) => {
          if ((event.key === " " || event.code === "Space") && event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
          if (event.isComposing || editor.view.composing || event.keyCode === 229) return false;
          if (event.key === "Delete" || event.key === "Backspace") syncSelection();
          current.current.onKeyDown(event);
          return event.defaultPrevented;
        },
        handlePaste: (_view, event) => {
          if (!event.clipboardData) return false;
          if (current.current.onPasteFiles(event.clipboardData.files)) return true;
          syncSelection();
          const parts = clipboardComposerParts(event.clipboardData.getData(COMPOSER_CLIPBOARD));
          editor.view.dispatch(closeHistory(editor.state.tr));
          editor.commands.insertContent(parts ? inlineContent(parts) : inlineContent([{ kind: "text", text: event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n") }]));
          editor.view.dispatch(closeHistory(editor.state.tr));
          return true;
        },
        handleDOMEvents: {
          copy: (_view, event) => copy(event, false),
          cut: (_view, event) => copy(event, true),
          compositionend: () => {
            setTimeout(() => {
              if (pending.current !== null && !editor.isDestroyed) {
                const value = pending.current; pending.current = null; apply(value);
              }
            }, 30);
            return false;
          },
        },
      },
      onUpdate: () => {
        const value = writeComposerDraft(partsFrom(editor.state.doc));
        current.current.onChange(value);
        updateAttributes(); emitSelection();
      },
      onSelectionUpdate: emitSelection,
      onFocus: () => { current.current.onFocus(); emitSelection(); },
      onTransaction: () => current.current.onInteraction?.(),
      onBlur: () => { current.current.onBlur(); current.current.onInteraction?.(); },
    });
    instance.current = editor;
    function updateAttributes() {
      editor.view.dom.dataset.placeholder = current.current.placeholder;
      editor.view.dom.dataset.empty = String(editor.isEmpty);
    }
    function apply(value: string) {
      if (value === writeComposerDraft(partsFrom(editor.state.doc))) return;
      if (value === "") {
        editor.view.updateState(EditorState.create({ schema: editor.schema, plugins: editor.state.plugins, doc: editor.schema.nodeFromJSON(composerContent(value)) }));
      } else editor.commands.setContent(composerContent(value), { emitUpdate: false });
      updateAttributes(); emitSelection();
    }
    function syncSelection() {
      const selection = editor.view.dom.ownerDocument.getSelection();
      if (!selection?.anchorNode || !selection.focusNode || !editor.view.dom.contains(selection.anchorNode) || !editor.view.dom.contains(selection.focusNode)) return;
      const anchor = editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset);
      const head = editor.view.posAtDOM(selection.focusNode, selection.focusOffset);
      const next = TextSelection.between(editor.state.doc.resolve(anchor), editor.state.doc.resolve(head));
      if (!next.eq(editor.state.selection)) editor.view.dispatch(editor.state.tr.setSelection(next));
    }
    function copy(event: ClipboardEvent, cut: boolean): boolean {
      if (!event.clipboardData) return false;
      syncSelection();
      if (editor.state.selection.empty) return false;
      const parts = partsFrom(editor.state.selection.content().content);
      event.clipboardData.setData(COMPOSER_CLIPBOARD, JSON.stringify(parts));
      event.clipboardData.setData("text/plain", composerPrompt(writeComposerDraft(parts)));
      event.preventDefault();
      if (cut) editor.view.dispatch(editor.state.tr.deleteSelection());
      return true;
    }
    const handle: ComposerEditorHandle = {
      focus: (position) => {
        if (position === "end") editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
        editor.view.focus();
      },
      blur: () => { editor.view.dom.blur(); },
      visible: () => editor.view.dom.offsetParent !== null,
      focused: () => editor.isFocused,
      composing: () => editor.view.composing,
      atTop: () => {
        const { selection, doc } = editor.state;
        return editor.isEmpty || (selection.empty && doc.firstChild === selection.$from.parent && editor.view.endOfTextblock("up"));
      },
      selection: () => snapshot(editor),
      replaceRange: (range, text) => {
        if (editor.view.composing) return false;
        const { positions } = linearDocument(editor.state.doc);
        const from = positions[range.start], to = positions[range.end];
        if (from === undefined || to === undefined || from > to) return false;
        editor.view.dispatch(closeHistory(editor.state.tr));
        const replaced = editor.chain().focus().insertContentAt({ from, to }, inlineContent([{ kind: "text", text }])).run();
        editor.view.dispatch(closeHistory(editor.state.tr));
        return replaced;
      },
      insertFile: (range, file) => {
        editor.view.dispatch(closeHistory(editor.state.tr));
        const { positions } = linearDocument(editor.state.doc);
        editor.chain().focus().insertContentAt({ from: positions[range.start], to: positions[range.end] }, inlineContent([{ kind: "file", ...file }, { kind: "text", text: " " }])).run();
        editor.view.dispatch(closeHistory(editor.state.tr));
      },
      deleteRange: (range) => {
        if (editor.view.composing) return false;
        const { positions } = linearDocument(editor.state.doc);
        const from = positions[range.start], to = positions[range.end];
        if (from === undefined || to === undefined) return false;
        editor.view.dispatch(closeHistory(editor.state.tr));
        const removed = editor.chain().focus().deleteRange({ from, to }).run();
        editor.view.dispatch(closeHistory(editor.state.tr));
        return removed;
      },
      newline: () => { editor.commands.setHardBreak(); },
    };
    Object.assign(current.current.inputRef, { current: handle });
    updateAttributes();
    return () => {
      Object.assign(current.current.inputRef, { current: null });
      editor.destroy(); instance.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const editor = instance.current;
    if (!editor) return;
    editor.view.dom.dataset.placeholder = props.placeholder;
    if (props.value === writeComposerDraft(partsFrom(editor.state.doc))) return;
    if (editor.view.composing) { pending.current = props.value; return; }
    if (props.value === "") {
      editor.view.updateState(EditorState.create({ schema: editor.schema, plugins: editor.state.plugins, doc: editor.schema.nodeFromJSON(composerContent(props.value)) }));
    } else editor.commands.setContent(composerContent(props.value), { emitUpdate: false });
    editor.view.dom.dataset.empty = String(editor.isEmpty);
    current.current.onSelection(snapshot(editor));
  }, [props.value, props.placeholder]);

  return <div ref={mount} className="oc-editor-mount" />;
}
