import type { ReasonPayload } from "./reason.ts";

export const CHAT_ID = "exitplan-copy";

export const exitPlanCopyCases = [
  {
    "id": "text-then-exact-exit-plan",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Plan explanation"
      },
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "ExitPlanMode",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "ExitPlanMode",
        "rawInput": {
          "plan": "Retained plan"
        }
      }
    ],
    "expectedClipboard": [],
    "regression": true
  },
  {
    "id": "exact-exit-plan-before-text",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "ExitPlanMode",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "ExitPlanMode",
        "rawInput": {
          "plan": "Retained plan"
        }
      },
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Plan explanation"
      }
    ],
    "expectedClipboard": [],
    "regression": true
  },
  {
    "id": "failed-exit-plan-keeps-suppression",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Plan explanation"
      },
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "ExitPlanMode",
        "kind": "other",
        "status": "failed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "ExitPlanMode",
        "rawInput": {
          "plan": "Retained plan"
        }
      }
    ],
    "expectedClipboard": [],
    "regression": true
  },
  {
    "id": "provider-display-title-is-not-the-name",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Plan explanation"
      },
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "Submit review",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "ExitPlanMode",
        "rawInput": {
          "plan": "Retained plan"
        }
      }
    ],
    "expectedClipboard": [],
    "regression": true
  },
  {
    "id": "ordinary-text",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Final answer"
      }
    ],
    "expectedClipboard": [
      "Final answer"
    ],
    "regression": false
  },
  {
    "id": "enter-plan-is-not-exit-plan",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Final answer"
      },
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "EnterPlanMode",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "EnterPlanMode",
        "rawInput": {
          "plan": "Retained plan"
        }
      }
    ],
    "expectedClipboard": [
      "Final answer"
    ],
    "regression": false
  },
  {
    "id": "question-is-not-exit-plan",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Final answer"
      },
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "AskUserQuestion",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "AskUserQuestion",
        "rawInput": {
          "plan": "Retained plan"
        }
      }
    ],
    "expectedClipboard": [
      "Final answer"
    ],
    "regression": false
  },
  {
    "id": "read-tool-is-not-exit-plan",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Final answer"
      },
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "Read",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "Read",
        "rawInput": {
          "file_path": "notes.txt"
        }
      }
    ],
    "expectedClipboard": [
      "Final answer"
    ],
    "regression": false
  },
  {
    "id": "tool-name-match-is-case-sensitive",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Final answer"
      },
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "exitplanmode",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "exitplanmode",
        "rawInput": {
          "plan": "Retained plan"
        }
      }
    ],
    "expectedClipboard": [
      "Final answer"
    ],
    "regression": false
  },
  {
    "id": "exit-plan-in-input-is-not-a-tool-name",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "Final answer"
      },
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "Read",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "Read",
        "rawInput": {
          "file_path": "ExitPlanMode"
        }
      }
    ],
    "expectedClipboard": [
      "Final answer"
    ],
    "regression": false
  },
  {
    "id": "exit-plan-without-text-has-no-copy",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "tool",
        "id": "one-tool",
        "title": "ExitPlanMode",
        "kind": "other",
        "status": "completed",
        "output": "Retained tool result",
        "diffs": [],
        "locations": [],
        "toolName": "ExitPlanMode",
        "rawInput": {
          "plan": "Retained plan"
        }
      }
    ],
    "expectedClipboard": [],
    "regression": false
  },
  {
    "id": "exit-plan-literal-text-is-not-a-tool",
    "payloads": [
      {
        "chatId": "exitplan-copy",
        "type": "text",
        "text": "The word ExitPlanMode is literal text."
      }
    ],
    "expectedClipboard": [
      "The word ExitPlanMode is literal text."
    ],
    "regression": false
  }
] satisfies { id: string; payloads: ReasonPayload[]; expectedClipboard: string[]; regression: boolean }[];
