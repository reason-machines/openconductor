import type { ReasonPayload } from "./reason.ts";

export const CHAT_ID = "final-copy";

const text = (value: string): ReasonPayload => ({ chatId: CHAT_ID, type: "text", text: value });
const thought = (value: string): ReasonPayload => ({ chatId: CHAT_ID, type: "thought", text: value });
const read: ReasonPayload = {
  chatId: CHAT_ID, type: "tool", id: "read-one", title: "Read", kind: "read", status: "completed",
  output: "file bytes", diffs: [], locations: [], toolName: "Read", rawInput: { file_path: "notes.txt" },
};

interface FinalCopyCase {
  name: string;
  payloads: ReasonPayload[];
  expectedClipboard: string[];
  regression: boolean;
}

export const finalCopyCases: FinalCopyCase[] = [
  {
    name: "two text blocks separated by thinking copy only the last block",
    payloads: [text("Progress"), thought("Working"), text("Final answer")],
    expectedClipboard: ["Final answer"], regression: true,
  },
  {
    name: "a tool between text blocks does not enter final copy",
    payloads: [text("Reading notes"), read, text("The final result")],
    expectedClipboard: ["The final result"], regression: true,
  },
  {
    name: "three text blocks copy only the third",
    payloads: [text("One"), thought("a"), text("Two"), thought("b"), text("Three")],
    expectedClipboard: ["Three"], regression: true,
  },
  {
    name: "the selected block retains all leading and trailing whitespace",
    payloads: [text("Earlier"), thought("a"), text("  Final answer\n ")],
    expectedClipboard: ["  Final answer\n "], regression: true,
  },
  {
    name: "trailing blank text is skipped without trimming the selected block",
    payloads: [text("Final answer\n"), thought("a"), text(" \n\t")],
    expectedClipboard: ["Final answer\n"], regression: true,
  },
  {
    name: "final Markdown and file-looking text are literal clipboard bytes",
    payloads: [text("Earlier **notes**"), thought("a"), text('## Final\nAssistant @"src/a file.ts"\n<literal>**text**</literal>')],
    expectedClipboard: ['## Final\nAssistant @"src/a file.ts"\n<literal>**text**</literal>'], regression: true,
  },
  {
    name: "Unicode in the last block is preserved",
    payloads: [text("Earlier"), thought("a"), text("Résumé 日本語")],
    expectedClipboard: ["Résumé 日本語"], regression: true,
  },
  {
    name: "blank-only payloads produce no final-copy control",
    payloads: [text(" \n\t")],
    expectedClipboard: [], regression: false,
  },
  {
    name: "one ordinary text block is unchanged",
    payloads: [text("One final answer")],
    expectedClipboard: ["One final answer"], regression: false,
  },
  {
    name: "adjacent text deltas remain one complete block",
    payloads: [text("Hello "), text("world")],
    expectedClipboard: ["Hello world"], regression: false,
  },
  {
    name: "trailing thinking does not replace the only text block",
    payloads: [text("Final answer"), thought("Retained thought")],
    expectedClipboard: ["Final answer"], regression: false,
  },
  {
    name: "thought-only content offers no final-copy control",
    payloads: [thought("Thinking only")],
    expectedClipboard: [], regression: false,
  },
  {
    name: "empty text payloads do not erase the selected block",
    payloads: [text("Final answer"), text("")],
    expectedClipboard: ["Final answer"], regression: false,
  },
  {
    name: "one multiline block is copied in full",
    payloads: [text("First paragraph\n\nSecond paragraph\n")],
    expectedClipboard: ["First paragraph\n\nSecond paragraph\n"], regression: false,
  },
];
