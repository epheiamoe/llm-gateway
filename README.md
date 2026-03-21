# LLM Gateway

Lightweight LLM API gateway with multi-provider routing, automatic fallback chains, sticky routing, and a built-in management UI.

## Features

- Multi-provider support (OpenAI, Anthropic, Google Gemini, and compatible APIs)
- Automatic fallback with health-based routing and exponential backoff
- Sticky routing — successful deployments are preferred for 2 hours (configurable), with manual pin support
- Fallback chains with visual builder (models or provider-based)
- API key management with per-key model restrictions and rate limiting
- Admin authentication for management API and UI
- Request logging with 7-day retention and analytics dashboard
- EMA-based latency tracking for accurate performance metrics
- Playground for testing routes with trace visualization

## Why I Built This

Running multiple AI agents means juggling a dozen LLM providers — some cheap but flaky, others reliable but expensive. OpenClaw's built-in failover only triggers on auth and rate-limit errors, which isn't enough when providers go silently degraded or return garbage. I needed a single gateway that sits in front of everything: automatically retries on any failure, sticks to the last working deployment for a while (sticky routing), and lets me manage providers, models, and API keys through a UI instead of editing JSON by hand. This is that gateway.

## Tech Stack

- **Runtime:** Next.js 15 (App Router) on Bun/Node.js
- **Database:** SQLite via bun:sqlite / better-sqlite3
- **UI:** React, custom dark theme (no UI framework)
- **Process Manager:** pm2

## Quick Start

### With Bun (recommended)

```bash
bun install
bun run dev
```

### With Node.js (v18+)

```bash
npm install
npm run dev
```

Open `http://localhost:3456/ui` to access the management dashboard.

## Authentication

### Management API (`/api/*`) and UI (`/ui`)

Protected by `ADMIN_KEY` environment variable. If not set, the management API is open (suitable for local-only access).

```bash
# Set admin key
export ADMIN_KEY="your-secret-key"

# Access with header
curl -H "x-admin-key: $ADMIN_KEY" http://localhost:3456/api/providers

# Or via Authorization header
curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:3456/api/providers
```

The UI uses cookie-based auth — log in at `/ui` with the admin key.

### Proxy Endpoints (`/v1/*`)

Protected by gateway API keys (prefix `gw-`). Create keys via the management UI or API.

- If **no API keys exist**: proxy is open (initial setup mode)
- If **API keys exist**: every proxy request must include a valid `gw-` key

```bash
# Via Authorization header
curl -H "Authorization: Bearer gw-xxxxx" http://localhost:3456/v1/chat/completions

# Via x-api-key header (Anthropic-style)
curl -H "x-api-key: gw-xxxxx" http://localhost:3456/v1/messages
```

Keys support per-key model restrictions, rate limiting, and usage tracking.

### Health Check

`GET /api/health` — always accessible, no auth required. Returns `{ ok: true, uptimeMs: <ms> }`.

## Production Deployment (pm2)

```bash
# Build first
npm run build

# Using ecosystem config
pm2 start ecosystem.config.cjs

# Or manually
ADMIN_KEY=your-key pm2 start "npm start" --name llm-gateway
```

## UI Pages

| Page | Description |
|---|---|
| Dashboard | Stats overview, sticky route management (pin/clear), model performance, recent requests, cooldowns |
| Playground | Test model routing with request/response trace visualization |
| Providers | Manage LLM providers (OpenAI, Anthropic, Gemini compatible) |
| Models | Manage models and their deployment configurations |
| Chains | Build fallback chains (model-based or provider-based) |
| API Keys | Create and manage gateway API keys with model restrictions |
| Logs | Request logs with filtering, detail view, and error inspection |

## API Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | None | Health check |
| `POST /v1/chat/completions` | API Key (`gw-`) | OpenAI-compatible proxy |
| `POST /v1/responses` | API Key (`gw-`) | OpenAI Responses API proxy |
| `GET /v1/responses/:id` | API Key (`gw-`) | Retrieve stored response |
| `POST /v1/embeddings` | API Key (`gw-`) | Embeddings proxy |
| `POST /v1/rerank` | API Key (`gw-`) | Rerank proxy |
| `POST /v1/messages` | API Key (`gw-`) | Anthropic-compatible proxy |
| `GET /v1/models` | None | List available models |
| `GET /api/providers` | Admin | List providers |
| `GET /api/models` | Admin | List models with deployments |
| `GET /api/chains` | Admin | List fallback chains |
| `GET /api/keys` | Admin | List API keys |
| `GET /api/stats` | Admin | Gateway statistics |
| `GET /api/model-stats` | Admin | Per-model performance stats |
| `GET /api/logs` | Admin | Request logs (paginated) |
| `GET /api/sticky-routes` | Admin | Active sticky routes |
| `POST /api/sticky-routes` | Admin | Pin deployment to model |
| `DELETE /api/sticky-routes` | Admin | Clear sticky routes |
| `GET /api/cooldowns` | Admin | Active provider cooldowns |
| `POST /api/test-route` | Admin | Test routing (playground) |

## For AI Agents

If you're an AI agent with tool access, read `llms.txt` at the gateway URL for the full API reference:

```
GET http://<gateway-host>:<port>/llms.txt
```

## Configuration

Set port and admin key via environment variables:

```bash
PORT=3456 ADMIN_KEY=your-secret npm start
```

## License

MIT
