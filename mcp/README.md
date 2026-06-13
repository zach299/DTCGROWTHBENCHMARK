# Growth Signals — MCP Server

Query Growth Signals from Claude (Desktop, Code, or any MCP client) — no
dashboard required.

## Setup

```bash
cd mcp
npm install
```

Set the API base to your deployed app (defaults to the Vercel production URL):

```bash
export GROWTH_SIGNALS_API_BASE="https://dtcgrowthbenchmark.vercel.app"
```

## Connect to Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "growth-signals": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/index.mjs"],
      "env": { "GROWTH_SIGNALS_API_BASE": "https://dtcgrowthbenchmark.vercel.app" }
    }
  }
}
```

Restart Claude Desktop.

## Tools

| Tool | What it does |
|---|---|
| `get_company` | Full growth intelligence for a domain (analyzes it if new) |
| `search_companies` | Find companies by name/domain |
| `compare_companies` | Side-by-side growth comparison |
| `get_growth_timeline` | How a company's ad activity changed over time |
| `get_watchlist` | Saved companies, filter by list / min score / momentum |
| `get_top_movers` | Fastest-growing companies by momentum + ad growth |

## Example prompts

- "Tell me about Ridge."
- "Compare Ridge and AG1."
- "Show me the growth timeline for HexClad."
- "Which companies in my watchlist have Exploding momentum?"
- "Which saved companies have a Growth Score above 90?"
- "Show me the fastest-growing companies."

Responses are structured intelligence (scores, signals, a recommendation) —
never raw JSON.
