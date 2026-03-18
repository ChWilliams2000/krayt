import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

const server = new McpServer({ name: "notify", version: "1.0.0" });
const EMOJI = { info: "ℹ️", medium: "⚠️", high: "🔴", critical: "🚨" };

server.tool("send_alert",
  `Sends a notification when a significant finding occurs. All severities
   are sent to Discord. Requires DISCORD_WEBHOOK_URL to be set.`,
  { severity: z.enum(["info","medium","high","critical"]), message: z.string(), finding_url: z.string().optional(), engagement_id: z.string().optional() },
  async ({ severity, message, finding_url, engagement_id }) => {
    const text = `${EMOJI[severity]} **[${severity.toUpperCase()}]** ${message}${finding_url ? `\n🔗 ${finding_url}` : ""}${engagement_id ? `\n📁 ${engagement_id}` : ""}`;

    if (!process.env.DISCORD_WEBHOOK_URL) {
      return { content: [{ type: "text", text: "DISCORD_WEBHOOK_URL not set — skipping notification" }] };
    }

    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });

    return { content: [{ type: "text", text: JSON.stringify({ sent: ["discord"], message }) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
