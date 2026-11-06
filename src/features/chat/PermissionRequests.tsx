// The card above the composer while the agent waits on the user (the chat's
// oldest open permission request, chatRuntime.ts). Layouts and copy follow
// Conductor 0.87.6 (REA-read renderApp chunk; evidence/chat-status):
// - permission (`Jpo`): "Do you want to run this command?" with the tool call,
//   then Yes (`chat.approveToolCall`), the alternate approval
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
import { canSubmit, chooseOption, emptyDrafts, isAnswered, permissionButtons, permissionHeading, questionAnswers, typeOther, type QuestionDraft } from "./permissionPrompts.ts";
import type { PermissionAnswer, PermissionOption, PermissionPrompt, Question } from "./chatRuntime.ts";
import "./PermissionRequests.css";

interface Props {
  /** Open requests, oldest first; the card shows the oldest. */
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

export function PermissionRequests({ permissions, onAnswer, onStop }: Props) {
  const r = permissions[0];
  if (!r) return null;
  const answer = (a: PermissionAnswer) => onAnswer(r.requestId, a);
  return (
    <div className="prompt-wrap" data-testid="chat-permission-request" data-kind={r.kind}>
      {r.kind === "permission" ? (
        <PermissionCard key={r.requestId} tool={r.tool} title={r.title} input={r.input} options={r.options} onAnswer={answer} />
      ) : r.kind === "plan" ? (
        <PlanCard key={r.requestId} plan={r.plan} onAnswer={answer} />
      ) : (
        <QuestionCard key={r.requestId} questions={r.questions} onAnswer={answer} onStop={onStop} />
      )}
    </div>
  );
}

function inputPreview(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "object" && input !== null && "command" in input && typeof input.command === "string") return input.command;
  const text = JSON.stringify(input, null, 2);
  return text === "{}" ? null : text;
}

function PermissionCard({ tool, title, input, options, onAnswer }: { tool: string; title: string; input: unknown; options: PermissionOption[]; onAnswer: (a: PermissionAnswer) => void }) {
  const hint = useHint();
  const { allow, alternate, others, deny } = permissionButtons(options);
  const pick = (o: PermissionOption | undefined) => (o ? () => onAnswer({ kind: "option", optionId: o.optionId }) : undefined);
  const decline = () => onAnswer({ kind: "cancel" });
  useKeybindings({
    "chat.approveToolCall": pick(allow),
    "chat.autoAcceptToolCall": pick(alternate),
    "chat.denyToolCall": pick(deny) ?? decline,
  });
  const preview = inputPreview(input);
  const button = (o: PermissionOption, command?: string) => (
    <button key={o.optionId} type="button" className="prompt-option" data-kind={o.kind} onClick={() => onAnswer({ kind: "option", optionId: o.optionId })}>
      <span className="prompt-option-label">{o.name || o.optionId}</span>
      {command ? <kbd>{hint(command)}</kbd> : null}
    </button>
  );
  return (
    <div className="prompt-card" role="group" aria-label="Approve tool use">
      <div className="prompt-heading">{permissionHeading(tool)}</div>
      <div className="prompt-body">
        {title ? <div className="prompt-tool-title">{title}</div> : null}
        {preview && preview !== title ? <pre className="prompt-input">{preview}</pre> : null}
        {!title && !preview ? <span className="muted">Approve this tool request to continue</span> : null}
      </div>
      <div className="prompt-options">
        {allow ? button(allow, "chat.approveToolCall") : null}
        {alternate ? button(alternate, "chat.autoAcceptToolCall") : null}
        {others.map((o) => button(o))}
        {deny ? (
          button(deny, "chat.denyToolCall")
        ) : (
          <button type="button" className="prompt-option" data-kind="cancel" onClick={decline}>
            <span className="prompt-option-label">No</span>
            <kbd>{hint("chat.denyToolCall")}</kbd>
          </button>
        )}
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
