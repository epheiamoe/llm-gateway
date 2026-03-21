import { randomUUID } from "crypto";
import Database from "better-sqlite3";

interface DbLike {
  exec(sql: string): void;
  query(sql: string): { all(...p: any[]): any[]; get(...p: any[]): any; run(...p: any[]): any };
}

function wrapBetterSqlite3(raw: Database.Database): DbLike {
  return {
    exec: (sql: string) => raw.exec(sql),
    query: (sql: string) => {
      const stmt = raw.prepare(sql);
      return { all: (...p: any[]) => stmt.all(...p), get: (...p: any[]) => stmt.get(...p), run: (...p: any[]) => stmt.run(...p) };
    },
  };
}

const raw = new Database("gateway.db");
const db: DbLike = wrapBetterSqlite3(raw);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// Migrations
try { db.exec("ALTER TABLE providers ADD COLUMN tags TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE providers ADD COLUMN customHeaders TEXT NOT NULL DEFAULT '{}'"); } catch {}
try { db.exec("UPDATE deployments SET timeout = 32 WHERE timeout = 16"); } catch {}
try { db.exec("DELETE FROM deployment_stats WHERE deploymentId NOT IN (SELECT id FROM deployments)"); } catch {}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      baseUrl TEXT NOT NULL,
      apiKey TEXT NOT NULL DEFAULT '',
      apiType TEXT NOT NULL DEFAULT 'openai',
      createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      modelId TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
      providerId TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      modelName TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 1,
      timeout INTEGER NOT NULL DEFAULT 60,
      maxRetries INTEGER NOT NULL DEFAULT 2,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      model TEXT,
      deploymentId TEXT,
      providerName TEXT,
      status INTEGER,
      latencyMs INTEGER,
      tokensIn INTEGER DEFAULT 0,
      tokensOut INTEGER DEFAULT 0,
      error TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      rateLimit INTEGER DEFAULT 0,
      allowedModels TEXT DEFAULT '',
      totalRequests INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      lastUsedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS deployment_stats (
      deploymentId TEXT PRIMARY KEY,
      totalRequests INTEGER DEFAULT 0,
      successCount INTEGER DEFAULT 0,
      failCount INTEGER DEFAULT 0,
      avgLatencyMs REAL DEFAULT 0,
      lastError TEXT,
      lastErrorAt INTEGER,
      cooldownUntil INTEGER DEFAULT 0,
      consecutiveFails INTEGER DEFAULT 0
    );
  `);
}

function initChainSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fallback_chains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT 'model',
      items TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
}

export function getDb(): DbLike {
  return db;
}

initSchema();
initChainSchema();

export function uuid(): string {
  return randomUUID();
}

let lastLogPrune = 0;

// --- Provider CRUD ---
export function listProviders() {
  return getDb().query("SELECT * FROM providers ORDER BY name").all();
}

export function getProvider(id: string) {
  return getDb().query("SELECT * FROM providers WHERE id = ?").get(id);
}

export function createProvider(p: { name: string; baseUrl: string; apiKey: string; apiType: string; tags?: string; customHeaders?: string }) {
  const id = uuid();
  getDb().query("INSERT INTO providers (id, name, baseUrl, apiKey, apiType, tags, customHeaders) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, p.name, p.baseUrl, p.apiKey, p.apiType, p.tags || "", p.customHeaders || "{}");
  return getProvider(id);
}

export function updateProvider(id: string, p: { name?: string; baseUrl?: string; apiKey?: string; apiType?: string; tags?: string; customHeaders?: string }) {
  const existing: any = getProvider(id);
  if (!existing) return null;
  getDb().query("UPDATE providers SET name=?, baseUrl=?, apiKey=?, apiType=?, tags=?, customHeaders=? WHERE id=?").run(
    p.name ?? existing.name, p.baseUrl ?? existing.baseUrl, p.apiKey ?? existing.apiKey, p.apiType ?? existing.apiType, p.tags ?? existing.tags ?? "", p.customHeaders ?? existing.customHeaders ?? "{}", id
  );
  return getProvider(id);
}

export function deleteProvider(id: string) {
  const provider: any = getProvider(id);
  const providerName = provider?.name;
  const deps = getDb().query("SELECT id FROM deployments WHERE providerId = ?").all(id) as any[];
  for (const dep of deps) {
    getDb().query("DELETE FROM deployment_stats WHERE deploymentId = ?").run(dep.id);
  }
  getDb().query("DELETE FROM deployments WHERE providerId = ?").run(id);
  getDb().query("DELETE FROM providers WHERE id = ?").run(id);

  if (providerName) {
    const chains = listChains() as any[];
    for (const chain of chains) {
      try {
        const items = JSON.parse(chain.items);
        if (chain.mode === "provider" && Array.isArray(items)) {
          const filtered = items.filter((it: any) => it.provider !== providerName);
          if (filtered.length !== items.length) {
            updateChain(chain.id, { items: JSON.stringify(filtered) });
          }
        }
      } catch {}
    }
  }
}

// --- Model CRUD ---
export function listModels() {
  return getDb().query("SELECT * FROM models ORDER BY name").all();
}

export function getModel(id: string) {
  return getDb().query("SELECT * FROM models WHERE id = ?").get(id);
}

export function getModelByName(name: string) {
  return getDb().query("SELECT * FROM models WHERE name = ?").get(name);
}

export function createModel(name: string) {
  const id = uuid();
  getDb().query("INSERT INTO models (id, name) VALUES (?, ?)").run(id, name);
  return getModel(id);
}

export function updateModel(id: string, name: string) {
  getDb().query("UPDATE models SET name = ? WHERE id = ?").run(name, id);
}

export function deleteModel(id: string) {
  const deployments = listDeployments(id) as any[];
  const deploymentIds = deployments.map(d => d.id);
  getDb().query("DELETE FROM models WHERE id = ?").run(id);
  for (const depId of deploymentIds) {
    getDb().query("DELETE FROM deployment_stats WHERE deploymentId = ?").run(depId);
  }

  const modelName = deployments[0]?.modelName;
  if (modelName) {
    const chains = listChains() as any[];
    for (const chain of chains) {
      try {
        const items = JSON.parse(chain.items);
        let modified = false;
        if (chain.mode === "models" && Array.isArray(items)) {
          const filtered = items.filter((m: string) => m !== modelName);
          if (filtered.length !== items.length) {
            updateChain(chain.id, { items: JSON.stringify(filtered) });
            modified = true;
          }
        } else if (chain.mode === "provider" && Array.isArray(items)) {
          for (const item of items) {
            if (item.models && Array.isArray(item.models)) {
              const originalLength = item.models.length;
              item.models = item.models.filter((m: string) => m !== modelName);
              if (item.models.length !== originalLength) modified = true;
            }
          }
          if (modified) updateChain(chain.id, { items: JSON.stringify(items) });
        }
      } catch {}
    }
  }
}

// --- Deployment CRUD ---
export function listDeployments(modelId?: string) {
  if (modelId) {
    return getDb().query(`
      SELECT d.*, p.name as providerName, p.baseUrl, p.apiKey, p.apiType, p.customHeaders
      FROM deployments d JOIN providers p ON d.providerId = p.id
      WHERE d.modelId = ? ORDER BY d."order"
    `).all(modelId);
  }
  return getDb().query(`
    SELECT d.*, p.name as providerName, p.baseUrl, p.apiKey, p.apiType, p.customHeaders
    FROM deployments d JOIN providers p ON d.providerId = p.id
    ORDER BY d."order"
  `).all();
}

export function getDeployment(id: string) {
  return getDb().query(`
    SELECT d.*, p.name as providerName, p.baseUrl, p.apiKey, p.apiType, p.customHeaders
    FROM deployments d JOIN providers p ON d.providerId = p.id WHERE d.id = ?
  `).get(id);
}

export function createDeployment(p: { modelId: string; providerId: string; modelName: string; order?: number; timeout?: number; maxRetries?: number }) {
  const id = uuid();
  getDb().query("INSERT INTO deployments (id, modelId, providerId, modelName, \"order\", timeout, maxRetries) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    id, p.modelId, p.providerId, p.modelName, p.order ?? 1, p.timeout ?? 60, p.maxRetries ?? 2
  );
  return getDeployment(id);
}

export function updateDeployment(id: string, p: { modelName?: string; order?: number; timeout?: number; maxRetries?: number; enabled?: number }) {
  const existing: any = getDeployment(id);
  if (!existing) return null;
  getDb().query("UPDATE deployments SET modelName=?, \"order\"=?, timeout=?, maxRetries=?, enabled=? WHERE id=?").run(
    p.modelName ?? existing.modelName, p.order ?? existing.order, p.timeout ?? existing.timeout,
    p.maxRetries ?? existing.maxRetries, p.enabled !== undefined ? p.enabled : existing.enabled, id
  );
  return getDeployment(id);
}

export function deleteDeployment(id: string) {
  getDb().query("DELETE FROM deployment_stats WHERE deploymentId = ?").run(id);
  getDb().query("DELETE FROM deployments WHERE id = ?").run(id);
}

// --- Request Logs ---
export function insertLog(p: { model?: string; deploymentId?: string; providerName?: string; status?: number; latencyMs?: number; tokensIn?: number; tokensOut?: number; error?: string }) {
  const id = uuid();
  getDb().query("INSERT INTO request_logs (id, model, deploymentId, providerName, status, latencyMs, tokensIn, tokensOut, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id, p.model || null, p.deploymentId || null, p.providerName || null, p.status || null, p.latencyMs || null, p.tokensIn || 0, p.tokensOut || 0, p.error || null
  );
  // Prune old logs periodically
  const now = Date.now();
  if (now - lastLogPrune > 3600000) {
    lastLogPrune = now;
    const cutoff = now - 7 * 24 * 3600000;
    getDb().query("DELETE FROM request_logs WHERE createdAt < ?").run(cutoff);
  }
}

export function listLogs(limit = 100, offset = 0, filters?: { model?: string; status?: string; provider?: string }) {
  let where = "1=1";
  const params: any[] = [];
  if (filters?.model) { where += " AND model = ?"; params.push(filters.model); }
  if (filters?.status) { where += " AND status = ?"; params.push(parseInt(filters.status)); }
  if (filters?.provider) { where += " AND providerName = ?"; params.push(filters.provider); }
  params.push(limit, offset);
  return getDb().query(`SELECT * FROM request_logs WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params);
}

export function getLogCount() {
  return (getDb().query("SELECT COUNT(*) as count FROM request_logs").get() as any).count;
}

// --- API Keys ---
export function listApiKeys() {
  return getDb().query("SELECT * FROM api_keys ORDER BY createdAt DESC").all();
}

export function getApiKey(id: string) {
  return getDb().query("SELECT * FROM api_keys WHERE id = ?").get(id);
}

export function getApiKeyByKey(key: string) {
  return getDb().query("SELECT * FROM api_keys WHERE key = ?").get(key);
}

export function createApiKey(p: { name: string; allowedModels?: string; rateLimit?: number }) {
  const id = uuid();
  const key = `gw-${uuid().replace(/-/g, "")}`;
  getDb().query("INSERT INTO api_keys (id, name, key, allowedModels, rateLimit) VALUES (?, ?, ?, ?, ?)").run(
    id, p.name, key, p.allowedModels || "", p.rateLimit || 0
  );
  return getApiKey(id);
}

export function updateApiKey(id: string, p: { name?: string; enabled?: number; allowedModels?: string; rateLimit?: number }) {
  const existing: any = getApiKey(id);
  if (!existing) return null;
  getDb().query("UPDATE api_keys SET name=?, enabled=?, allowedModels=?, rateLimit=? WHERE id=?").run(
    p.name ?? existing.name, p.enabled !== undefined ? p.enabled : existing.enabled,
    p.allowedModels ?? existing.allowedModels, p.rateLimit ?? existing.rateLimit, id
  );
  return getApiKey(id);
}

export function deleteApiKey(id: string) {
  getDb().query("DELETE FROM api_keys WHERE id = ?").run(id);
}

export function incrementApiKeyUsage(id: string) {
  getDb().query("UPDATE api_keys SET totalRequests = totalRequests + 1, lastUsedAt = ? WHERE id = ?").run(Date.now(), id);
}

// --- Deployment Stats ---
export function getStats(deploymentId: string) {
  return getDb().query("SELECT * FROM deployment_stats WHERE deploymentId = ?").get(deploymentId) as any;
}

export function updateStats(deploymentId: string, p: Partial<{ totalRequests: number; successCount: number; failCount: number; avgLatencyMs: number; lastError: string; lastErrorAt: number; cooldownUntil: number; consecutiveFails: number }>) {
  const existing = getStats(deploymentId);
  if (!existing) {
    getDb().query("INSERT INTO deployment_stats (deploymentId, totalRequests, successCount, failCount, avgLatencyMs, lastError, lastErrorAt, cooldownUntil, consecutiveFails) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      deploymentId, p.totalRequests ?? 0, p.successCount ?? 0, p.failCount ?? 0, p.avgLatencyMs ?? 0, p.lastError ?? null, p.lastErrorAt ?? null, p.cooldownUntil ?? 0, p.consecutiveFails ?? 0
    );
  } else {
    getDb().query("UPDATE deployment_stats SET totalRequests=?, successCount=?, failCount=?, avgLatencyMs=?, lastError=?, lastErrorAt=?, cooldownUntil=?, consecutiveFails=? WHERE deploymentId=?").run(
      p.totalRequests ?? existing.totalRequests, p.successCount ?? existing.successCount, p.failCount ?? existing.failCount,
      p.avgLatencyMs ?? existing.avgLatencyMs, p.lastError ?? existing.lastError, p.lastErrorAt ?? existing.lastErrorAt,
      p.cooldownUntil ?? existing.cooldownUntil, p.consecutiveFails ?? existing.consecutiveFails, deploymentId
    );
  }
}

// --- Summary Stats ---
export function getSummaryStats() {
  const total = getDb().query("SELECT COUNT(*) as c FROM request_logs").get() as any;
  const success = getDb().query("SELECT COUNT(*) as c FROM request_logs WHERE status >= 200 AND status < 300").get() as any;
  const avgLatency = getDb().query("SELECT ROUND(AVG(latencyMs)) as avg FROM request_logs WHERE status >= 200 AND status < 300").get() as any;
  const providers = getDb().query("SELECT COUNT(*) as c FROM providers").get() as any;
  const models = getDb().query("SELECT COUNT(*) as c FROM models").get() as any;
  const lastHour = getDb().query("SELECT COUNT(*) as c FROM request_logs WHERE createdAt > ?").get(Date.now() - 3600000) as any;
  return {
    totalRequests: total.c,
    successRate: total.c > 0 ? Math.round((success.c / total.c) * 100) : 100,
    avgLatencyMs: avgLatency.avg || 0,
    providerCount: providers.c,
    modelCount: models.c,
    lastHourRequests: lastHour.c,
  };
}

export function getModelStats() {
  return getDb().query(`
    SELECT
      rl.model,
      COUNT(*) as totalRequests,
      SUM(CASE WHEN rl.status >= 200 AND rl.status < 300 THEN 1 ELSE 0 END) as successCount,
      SUM(CASE WHEN rl.status >= 400 THEN 1 ELSE 0 END) as failCount,
      ROUND(AVG(CASE WHEN rl.status >= 200 AND rl.status < 300 THEN rl.latencyMs END)) as avgLatencyMs,
      SUM(rl.tokensIn) as totalTokensIn,
      SUM(rl.tokensOut) as totalTokensOut
    FROM request_logs rl
    WHERE rl.model IS NOT NULL
    GROUP BY rl.model
    ORDER BY totalRequests DESC
  `).all();
}

export function getModelTimeline(hours: number = 24) {
  const since = Date.now() - hours * 3600000;
  return getDb().query(`
    SELECT
      model,
      CAST((createdAt / 3600000) AS INTEGER) * 3600000 as hour,
      COUNT(*) as count,
      SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as fail
    FROM request_logs
    WHERE createdAt > ? AND model IS NOT NULL
    GROUP BY model, hour
    ORDER BY hour
  `).all(since);
}

// --- Fallback Chains ---
export function listChains() {
  return getDb().query("SELECT * FROM fallback_chains ORDER BY name").all();
}

export function getChain(id: string) {
  return getDb().query("SELECT * FROM fallback_chains WHERE id = ?").get(id);
}

export function getChainByName(name: string) {
  return getDb().query("SELECT * FROM fallback_chains WHERE name = ? AND enabled = 1").get(name);
}

export function createChain(p: { name: string; mode: string; items: string }) {
  const id = uuid();
  getDb().query("INSERT INTO fallback_chains (id, name, mode, items) VALUES (?, ?, ?, ?)").run(id, p.name, p.mode, p.items);
  return getChain(id);
}

export function updateChain(id: string, p: { name?: string; mode?: string; items?: string; enabled?: number }) {
  const existing: any = getChain(id);
  if (!existing) return null;
  getDb().query("UPDATE fallback_chains SET name=?, mode=?, items=?, enabled=? WHERE id=?").run(
    p.name ?? existing.name, p.mode ?? existing.mode, p.items ?? existing.items,
    p.enabled !== undefined ? p.enabled : existing.enabled, id
  );
  return getChain(id);
}

export function deleteChain(id: string) {
  getDb().query("DELETE FROM fallback_chains WHERE id = ?").run(id);
}
