// parity:pr.review-actions:ui
// The target branch picker (Conductor's `EJe`, renderApp @ ~2,932,472):
// "Select target branch...", "Loading branches...", "Couldn't load
// branches." / Try again, "No branch found.", and a "default" badge.
import { useEffect, useMemo, useState } from "react";
import { ensureRepository, listBranches, type BranchDto } from "../../../workspace/api";
import "./edit.css";

type Branches = { status: "loading" } | { status: "error" } | { status: "ready"; items: BranchDto[] };

export function BranchPicker({ base, repoId, repoPath, defaultBranch, onPick, onClose }: { base: string; repoId?: string; repoPath: string; defaultBranch: string; onPick: (b: string) => void; onClose: () => void }) {
  const [branches, setBranches] = useState<Branches>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setBranches({ status: "loading" });
    // The project id picks the right row when a folder has `-v1` copies.
    ensureRepository(repoPath, repoId)
      .then((r) => listBranches(r.id, defaultBranch))
      .then((items) => live && setBranches({ status: "ready", items }), () => live && setBranches({ status: "error" }));
    return () => {
      live = false;
    };
  }, [repoId, repoPath, defaultBranch, attempt]);
  const names = useMemo(() => {
    if (branches.status !== "ready") return [];
    const seen = new Set<string>();
    for (const b of branches.items) seen.add(b.name.replace(/^origin\//, ""));
    const q = query.trim().toLowerCase();
    return [...seen].filter((n) => n.toLowerCase().includes(q));
  }, [branches, query]);
  return (
    <div className="pr-base-picker" role="dialog" aria-label="Select target branch" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <input autoFocus placeholder="Select target branch..." value={query} onChange={(e) => setQuery(e.target.value)} />
      {branches.status === "loading" && <p className="muted small">Loading branches...</p>}
      {branches.status === "error" && (
        <p className="muted small">
          Couldn't load branches. <button className="link-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </p>
      )}
      {branches.status === "ready" && names.length === 0 && <p className="muted small">No branch found.</p>}
      {branches.status === "ready" && names.length > 0 && (
        <ul>
          {names.map((n) => (
            <li key={n}>
              <button className={n === base ? "selected" : ""} onClick={() => onPick(n)}>
                <span>{n}</span>
                {n === defaultBranch && <span className="pr-badge">default</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

