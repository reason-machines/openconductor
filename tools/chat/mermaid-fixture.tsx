import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Markdown } from "../../src/features/chat/markdown";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/features/chat/chat.css";

const sample = "```mermaid\nflowchart LR\n  A[Request] --> B[Response]\n```";
document.documentElement.dataset.theme = "light";
function Fixture() {
  const [text, setText] = useState(sample);
  return <main style={{ maxWidth: 760, margin: "60px auto", color: "var(--text)", background: "var(--bg)", padding: 24 }}>
    <h1>Transcript diagrams</h1>
    <label>Message<textarea aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} style={{ display: "block", width: "100%", minHeight: 100 }} /></label>
    <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "light" ? "dark" : "light"; }}>Toggle theme</button>
    <Markdown text={text} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);
