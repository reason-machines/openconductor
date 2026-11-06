// Conductor's /team (`Yea`, renderApp-D_fmY7hW.js @9,944,079; card `eta`,
// avatar `nta`), on the Reason workspace. A 36 px drag strip, then a
// max-w-6xl column (px-8) with "<org> Team" (text-lg font-medium) and:
//  - no team organization: "Teammates appear here when you're in a team
//    organization. Switch organizations in the sidebar to see your team."
//  - loading, "Couldn't load your team." with Try again, "No members found
//    in this organization.", or a grid of member cards (1/2/3 columns).
// OpenConductor's team organization is the Reason workspace picked in the
// account switcher (src/org); its people come from `reason call
// listMembers`, ordered like Conductor's `Qea`. Reason keeps no per-member
// workspace activity, so a card shows the role and email where Conductor
// shows the member's workspaces and their 14-day chart.
import { useEffect, useState } from "react";
import { errorText, loadMembers } from "../../org/api";
import { memberRow, type Member } from "../../org/organization";
import { useOrganization } from "../../org/useOrganization";
import "./team.css";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; members: Member[] };

export function TeamPage() {
  const { active } = useOrganization();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [tick, setTick] = useState(0);
  const orgId = active?.id ?? null;
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    setLoad({ state: "loading" });
    loadMembers().then(
      (members) => live && setLoad({ state: "ready", members }),
      (e) => live && setLoad({ state: "error", message: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, [orgId, tick]);

  return (
    <div className="team">
      <div className="team-drag" data-tauri-drag-region />
      <div className="team-scroll">
        <div className="team-body">
          <div className="team-head">
            <h1>{active ? `${active.name} Team` : "Team"}</h1>
          </div>
          {!active ? (
            <p className="team-note">Teammates appear here when you're in a team organization. Switch organizations in the sidebar to see your team.</p>
          ) : load.state === "loading" ? (
            <div className="team-status" role="status" aria-label="Loading">
              <span className="team-loader" />
            </div>
          ) : load.state === "error" ? (
            <div className="team-error">
              <p className="team-note" title={load.message}>
                Couldn't load your team.
              </p>
              <button type="button" className="team-outline" onClick={() => setTick((t) => t + 1)}>
                Try again
              </button>
            </div>
          ) : load.members.length === 0 ? (
            <p className="team-note">No members found in this organization.</p>
          ) : (
            <div className="team-grid">
              {load.members.map((m) => (
                <MemberCard key={m.userId} member={m} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberCard({ member }: { member: Member }) {
  const row = memberRow(member);
  return (
    <div className="team-card">
      <div className="team-card-head">
        <span className="team-avatar" aria-hidden>
          {row.primary.slice(0, 1).toUpperCase()}
        </span>
        <span className="team-card-name">{row.primary}</span>
        {row.role && <span className="team-card-role">{row.role}</span>}
      </div>
      {row.secondary && <p className="team-card-email">{row.secondary}</p>}
    </div>
  );
}
