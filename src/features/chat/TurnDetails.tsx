import { Popover } from "@base-ui/react/popover";
import type { TokenUsage } from "./types.ts";
import type { TurnTimeView } from "./turnTime.ts";
import "./turnDetails.css";

export function TurnDetails({ when, agent, usage }: { when: TurnTimeView; agent?: string; usage?: TokenUsage }) {
  const hasUsage = (usage?.inputTokens ?? 0) > 0 || (usage?.outputTokens ?? 0) > 0;
  return (
    <Popover.Root>
      <Popover.Trigger className="chat-turn-time oc-turn-time" openOnHover delay={300}>
        {when.label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="chat-turn-details-positioner" side="top" sideOffset={4} collisionPadding={8}>
          <Popover.Popup className="chat-turn-details" aria-label="Turn details">
            <div className="chat-turn-details-content">
              {agent ? <span className="chat-turn-details-agent">{agent}</span> : null}
              <span>{when.range}</span>
              {hasUsage ? (
                <dl className="chat-turn-details-usage">
                  <div><dt>Input</dt><dd>{usage?.inputTokens?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Output</dt><dd>{usage?.outputTokens?.toLocaleString() ?? "—"}</dd></div>
                </dl>
              ) : null}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
