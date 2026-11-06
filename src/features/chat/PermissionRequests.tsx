// The card above the composer while the agent waits on the user (the chat's
// oldest open permission request, chatRuntime.ts). Layouts and copy follow
// Conductor 0.87.6 (REA-read renderApp chunk; evidence/chat-status):
// - permission (`Jpo`), in the composer box in place of its editor
//   (`ToolApproval`): "Do you want to run this command?" with the tool call
//   drawn by the transcript's tool row, then Yes (`chat.approveToolCall`), the alternate approval
//   (`chat.autoAcceptToolCall`), other options, No (`chat.denyToolCall`). A
//   request that offers no reject option still gets No, which declines it
//   (ACP `cancelled`);
// - plan (`W7o`): the plan with Copy and Approve (`chat.approvePlan`); text sent
//   from the composer meanwhile asks for changes instead ("Enter your plan
//   adjustments here...");
// - questions (`H8i`): one page per question with its options, an "Other…"
//   answer, Previous/Next question, Submit (`chat.question.submit`) and
//   "Cancel agent".
// Bare-key shortcuts (Enter, Backspace, 1-9) only fire outside text fields
// (keybindings/dispatcher.ts), so typing in the composer is never an answer.

import { useEffect, useState } from "react";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { Markdown } from "./markdown.ts";
import { openUrl } from "../../backend.ts";
import { canSubmit, chooseOption, emptyDrafts, isAnswered, permissionButtons, permissionHeading, permissionTool, questionAnswers, typeOther, type QuestionDraft } from "./permissionPrompts.ts";
import type { PermissionAnswer, PermissionOption, PermissionPrompt, Question, ToolPrompt } from "./chatRuntime.ts";
import { ConductorToolRow } from "./ToolRows.tsx";
import "./PermissionRequests.css";

interface Props {
  /** Open requests, oldest first; the card shows the oldest plan or questions. */
  permissions: readonly PermissionPrompt[];
  onAnswer: (requestId: string, answer: PermissionAnswer) => void;
  /** "Cancel agent" on the questions card. */
  onStop: () => void;
}

function useHint() {
  const { overrides } = useKeybindingOverrides();
  return (id: string) => {
    const s = effectiveShortcuts(id, overrides)[0];
    return s ? glyphs(s) : "";
  };
}

/** The oldest tool approval: the composer shows it instead of its editor (`ToolApproval`). */
export function pendingToolApproval(permissions: readonly PermissionPrompt[]): ToolPrompt | undefined {
  return permissions.find((p): p is ToolPrompt => p.kind === "permission");
}

/** The plan and question cards above the composer; tool approvals are `ToolApproval`, in the composer. */
export function PermissionRequests({ permissions, onAnswer, onStop }: Props) {
  const r = permissions.find((p) => p.kind !== "permission");
  if (!r) return null;
  const answer = (a: PermissionAnswer) => onAnswer(r.requestId, a);
  return (
    <div className="prompt-wrap" data-testid="chat-permission-request" data-kind={r.kind}>
      {r.kind === "plan" ? (
        <PlanCard key={r.requestId} plan={r.plan} onAnswer={answer} />
      ) : (
        <QuestionCard key={r.requestId} questions={r.questions} onAnswer={answer} onStop={onStop} />
      )}
    </div>
  );
}

/**
 * A tool approval, in place of the composer's editor (Conductor's `Jpo`: the
 * composer box hides its form while `UDt(session)[0]` is set and shows this).
 * The heading asks what the tool does (`Xpo`), the transcript's own tool row
 * shows the call (`hIt` with no result), then Yes, the alternate approval, any
 * other options and No, each an outline button with its shortcut.
 */
export function ToolApproval({ request, onAnswer }: { request: ToolPrompt; onAnswer: (requestId: string, answer: PermissionAnswer) => void }) {
  const hint = useHint();
  const answer = (a: PermissionAnswer) => onAnswer(request.requestId, a);
  const { allow, alternate, others, deny } = permissionButtons(request.options);
  const pick = (o: PermissionOption | undefined) => (o ? () => answer({ kind: "option", optionId: o.optionId }) : undefined);
  const decline = () => answer({ kind: "cancel" });
  useKeybindings({
    "chat.approveToolCall": pick(allow),
    "chat.autoAcceptToolCall": pick(alternate),
    "chat.denyToolCall": pick(deny) ?? decline,
  });
  const tool = permissionTool(request);
  const [open, setOpen] = useState(false);
  const button = (key: string, label: string, onClick: () => void, command?: string, kind?: string) => (
    <button key={key} type="button" className="prompt-option" data-kind={kind} onClick={onClick}>
      <span className="prompt-option-label">{label}</span>
      {command ? <kbd>{hint(command)}</kbd> : null}
    </button>
  );
  return (
    <div className="prompt-approval" role="group" aria-label="Approve tool use" data-testid="chat-permission-request" data-kind="permission">
      <div className="prompt-heading">{permissionHeading(tool?.name ?? request.tool)}</div>
      <div className="prompt-body">
        {tool ? (
          <div className="chat-tool oc-tool-wrap">
            <ConductorToolRow tool={tool} status="running" isError={false} open={open} onToggle={() => setOpen((o) => !o)} />
          </div>
        ) : (
          <span className="muted">Approve this tool request to continue</span>
        )}
      </div>
      <div className="prompt-options">
        {/* Conductor labels the first and last buttons Yes and No whatever the options are called. */}
        {allow ? button(allow.optionId, "Yes", () => answer({ kind: "option", optionId: allow.optionId }), "chat.approveToolCall", allow.kind) : null}
        {alternate ? button(alternate.optionId, alternate.name || alternate.optionId, () => answer({ kind: "option", optionId: alternate.optionId }), "chat.autoAcceptToolCall", alternate.kind) : null}
        {others.map((o) => button(o.optionId, o.name || o.optionId, () => answer({ kind: "option", optionId: o.optionId }), undefined, o.kind))}
        {deny ? button(deny.optionId, "No", () => answer({ kind: "option", optionId: deny.optionId }), "chat.denyToolCall", deny.kind) : button("cancel", "No", decline, "chat.denyToolCall", "cancel")}
      </div>
    </div>
  );
}

function PlanCard({ plan, onAnswer }: { plan: string; onAnswer: (a: PermissionAnswer) => void }) {
  const hint = useHint();
  const [copied, setCopied] = useState(false);
  const approve = () => onAnswer({ kind: "plan", approved: true });
  useKeybindings({ "chat.approvePlan": approve });
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    void navigator.clipboard?.writeText(plan).then(
      () => setCopied(true),
      (e) => console.warn("chat: plan not copied", e),
    );
  };
  return (
    <div className="prompt-card" role="group" aria-label="Plan approval">
      <div className="prompt-heading prompt-plan-head">
        <span>Review the plan</span>
        <span className="prompt-plan-actions">
          <button type="button" className="prompt-small" onClick={copy} disabled={!plan} title={copied ? "Copied to clipboard" : "Copy plan to clipboard"}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="prompt-small is-primary" onClick={approve} title="Execute plan in current chat">
            Approve <kbd>{hint("chat.approvePlan")}</kbd>
          </button>
        </span>
      </div>
      <div className="prompt-plan">{plan ? <Markdown text={plan} className="chat-text" onOpenLink={(href) => void openUrl(href)} /> : <span className="muted">The agent sent no plan text.</span>}</div>
      <div className="prompt-foot muted">Type in the box below to ask for changes instead.</div>
    </div>
  );
}

function QuestionCard({ questions, onAnswer, onStop }: { questions: Question[]; onAnswer: (a: PermissionAnswer) => void; onStop: () => void }) {
  const hint = useHint();
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<QuestionDraft[]>(() => emptyDrafts(questions));
  const q = questions[page];
  const d = drafts[page];
  const last = page === questions.length - 1;
  const set = (next: QuestionDraft) => setDrafts((all) => all.map((x, i) => (i === page ? next : x)));
  const submit = () => {
    if (canSubmit(drafts)) onAnswer({ kind: "answers", answers: questionAnswers(drafts) });
  };
  const next = () => (last ? submit() : setPage(page + 1));
  const select = (n: number) => () => {
    const o = q?.options[n];
    if (!q || !d || !o) return false;
    set(chooseOption(q, d, o.label));
  };
  useKeybindings({
    "chat.question.submit": () => (canSubmit(drafts) ? next() : false),
    "chat.question.previous": () => (page > 0 ? setPage(page - 1) : false),
    "chat.question.next": () => (!last ? setPage(page + 1) : false),
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`chat.question.selectOption${i + 1}`, select(i)])),
  });
  if (!q || !d) return null;
  return (
    <div className="prompt-card" role="group" aria-label="Questions">
      <div className="prompt-heading prompt-question-head">
        {q.header ? <span className="prompt-question-header">{q.header}</span> : null}
        {questions.length > 1 ? (
          <span className="prompt-pages" aria-label="Questions">
            {questions.map((_, i) => (
              <button key={i} type="button" className="prompt-page" data-current={i === page || undefined} data-answered={isAnswered(drafts[i]!) || undefined} aria-label={`Question ${i + 1}`} onClick={() => setPage(i)} />
            ))}
          </span>
        ) : null}
      </div>
      <div className="prompt-question">{q.question}</div>
      <div className="prompt-options" role={q.multiSelect ? "group" : "radiogroup"} aria-label={q.question}>
        {q.options.map((o, i) => {
          const selected = d.chosen.includes(o.label);
          return (
            <button key={o.label} type="button" role={q.multiSelect ? "checkbox" : "radio"} aria-checked={selected} className="prompt-option" data-selected={selected || undefined} onClick={() => set(chooseOption(q, d, o.label))}>
              <span className="prompt-option-index">{i + 1}</span>
              <span className="prompt-option-text">
                <span className="prompt-option-label">{o.label}</span>
                {o.description ? <span className="prompt-option-desc muted">{o.description}</span> : null}
              </span>
            </button>
          );
        })}
        <input className="prompt-other" placeholder="Other…" aria-label="Other response" value={d.other} onChange={(e) => set(typeOther(q, d, e.target.value))} />
      </div>
      <div className="prompt-question-foot">
        <button type="button" className="prompt-small" onClick={onStop}>
          Cancel agent
        </button>
        <span className="prompt-plan-actions">
          {page > 0 ? (
            <button type="button" className="prompt-small" onClick={() => setPage(page - 1)}>
              Previous question
            </button>
          ) : null}
          {last ? (
            <button type="button" className="prompt-small is-primary" disabled={!canSubmit(drafts)} onClick={submit}>
              Submit <kbd>{hint("chat.question.submit")}</kbd>
            </button>
          ) : (
            <button type="button" className="prompt-small" onClick={() => setPage(page + 1)}>
              Next question
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
