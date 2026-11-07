import { Popover } from "@base-ui/react/popover";
import type { TurnTimeView } from "./turnTime.ts";
import "./turnDetails.css";

export function TurnDetails({ when, agent }: { when: TurnTimeView; agent?: string }) {
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
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
