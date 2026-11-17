  async getMcpServers({ sessionId: U } = {}) {
    if (U) {
      let G = this.liveSessions.get(U);
      if (!G || G.codex.isClosed)
        throw new S4({ userMessage: `Cannot fetch MCP status: session ${U} is not running`, code: y4.SESSION_NOT_FOUND, source: "agent", retryable: false, details: { sessionId: U } });
      return (await ln4({ fetchPage: (w) => G.codex.request("mcpServerStatus/list", { ...w ? { cursor: w } : {} }) })).map(dn4);
    }
    let { codex: B } = await this.createCodex({ sessionId: "metadata", localExecutionMcpEnabled: false, getDiffCommentsEnabled: false, summaryToolsEnabled: false });
    try {
      return (await ln4({ fetchPage: (D) => B.request("mcpServerStatus/list", { ...D ? { cursor: D } : {} }) })).map(dn4);
    } finally {
      await B.close();
    }
  }