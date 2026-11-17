function dn4(U) {
  let B = U.serverInfo !== null || Object.values(U.tools).some((G) => G !== undefined);
  return { name: U.name, status: B ? "connected" : U.authStatus === "notLoggedIn" ? "needs-auth" : "failed", tools: Object.values(U.tools).flatMap((G) => G === undefined ? [] : [{ name: G.name, description: G.description, annotations: G.annotations }]) };
}