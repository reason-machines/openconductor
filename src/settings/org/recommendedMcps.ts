// Settings › Organization › MCP › Recommended: Conductor 0.87.6's recommended
// list (`V$i`, renderApp-D_fmY7hW.js), the entries that need no extra OAuth
// app setup, with their public endpoints. Added through Reason's
// `createMcpServer`; Reason runs the sign-in when a server asks for one.
export interface RecommendedMcp {
  /** Conductor's id for the entry. */
  name: string;
  label: string;
  url: string;
}

export const RECOMMENDED_MCPS: readonly RecommendedMcp[] = [
  { name: "granola", label: "Granola", url: "https://mcp.granola.ai/mcp" },
  { name: "notion", label: "Notion", url: "https://mcp.notion.com/mcp" },
  { name: "airtable", label: "Airtable", url: "https://mcp.airtable.com/mcp" },
  { name: "linear", label: "Linear", url: "https://mcp.linear.app/mcp" },
  { name: "posthog", label: "PostHog", url: "https://mcp.posthog.com/mcp" },
  { name: "sentry", label: "Sentry", url: "https://mcp.sentry.dev/mcp" },
  { name: "composio", label: "Composio", url: "https://connect.composio.dev/mcp" },
  { name: "stripe", label: "Stripe", url: "https://mcp.stripe.com" },
  { name: "supabase", label: "Supabase", url: "https://mcp.supabase.com/mcp" },
  { name: "vercel", label: "Vercel", url: "https://mcp.vercel.com" },
  { name: "cloudflare", label: "Cloudflare", url: "https://mcp.cloudflare.com/mcp" },
  { name: "neon", label: "Neon", url: "https://mcp.neon.tech/mcp" },
  { name: "atlassian", label: "Atlassian", url: "https://mcp.atlassian.com/v1/mcp/authv2" },
  { name: "context7", label: "Context7", url: "https://mcp.context7.com/mcp" },
  { name: "exa", label: "Exa", url: "https://mcp.exa.ai/mcp" },
];
