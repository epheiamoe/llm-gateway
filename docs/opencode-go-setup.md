# OpenCode GO 多 key 负载均衡配置指南

本 fork 为自用场景增加了 **OpenCode GO 透传路由**：用单个 Gateway Model 服务 OpenCode GO 的多个真实模型，同时把 sticky routing 固定到同一个 API key，直到该 key 报错才切换。

## 工作原理

1. `/v1/models` 同时返回数据库中的 Model 和 `OPENCODE_GO_MODELS` 环境变量里的模型 ID。
2. 当 Opencode 请求一个真实模型（如 `glm-5.2`）时，Gateway 内部 fallback 到 `opencode-go` 这个 Model。
3. `opencode-go` 有 4 个 Deployment（对应 4 个 key），按 priority 选择。
4. 转发给 OpenCode 上游时，请求体里的 `model` 字段保留原始值（如 `glm-5.2`），不会变成 deployment 里填的默认值。
5. 成功后 sticky 到当前 Deployment（默认 2 小时），后续请求尽量用同一个 key。
6. 当前 key 失败后进入 cooldown，自动尝试下一个 key。

## 已预配置的内容

本地 Gateway 已经通过 API 创建好：

- 4 个 Provider：`opencode-go-1` ~ `opencode-go-4`
  - `baseUrl`: `https://opencode.ai/zen/go`
  - `apiType`: `openai`
  - `apiKey`: **空，需要你自己填写**
- 1 个 Model：`opencode-go`
- 4 个 Deployment：priority 1~4，modelName 默认 `glm-5.2`

## 你需要做的

### 1. 填写 4 个 OpenCode GO API Key

打开 Web UI：`http://localhost:3456/ui`

1. 点击左侧 **PROVIDERS**。
2. 依次点击 `opencode-go-1` ~ `opencode-go-4` 的 **Edit**。
3. 在 **API Key** 字段填入你的第 N 个 OpenCode GO key。
4. 点 **Save**。

> 注意：当前版本对每个 Provider 的 Test 按钮会返回 401，因为 deployment 的默认 modelName 是 `glm-5.2`，而 OpenCode 会校验 key。填好 key 后，用 Playground 或 Opencode 实际测试即可。

### 2. 确认环境变量

当前 `.env.local` 已包含：

```bash
PORT=3456
ADMIN_KEY=3bf7eea39c3bff5fef5afb10771c181b
OPENCODE_GO_FALLBACK_MODEL=opencode-go
OPENCODE_GO_MODELS=glm-5.2,glm-5.1,kimi-k2.7-code,kimi-k2.6,mimo-v2.5,mimo-v2.5-pro,minimax-m3,minimax-m2.7,qwen3.7-max,qwen3.7-plus,qwen3.6-plus,deepseek-v4-pro,deepseek-v4-flash
```

如果 OpenCode 新增模型，修改 `OPENCODE_GO_MODELS` 后重启服务即可。

### 3. 在 Opencode 中添加自定义 Provider

1. 打开 Opencode 设置，进入 Provider 配置。
2. 添加自定义 / OpenAI-compatible provider：
   - **Base URL**: `http://127.0.0.1:3456/v1`
   - **API Key**: 任意占位符（当前 proxy 端点开放，无需 `gw-` key）
3. 刷新模型列表，你会看到 14 个模型：
   - `opencode-go`（fallback，可直接用）
   - 13 个真实 OpenCode GO 模型（推荐用这个）
4. 选择你想用的模型（如 `glm-5.2`）开始对话。

### 4. 观察 Sticky 行为

打开 Web UI 的 **DASHBOARD**：

- **Sticky Routes** 面板会显示当前锁定的 Deployment。
- **Recent Requests** 显示最近请求用了哪个 Provider/Deployment。
- 连续成功请求应该都使用同一个 key，直到该 key 失败才切换。

## 关键行为

### 401 / 403 / AuthError

当前 Gateway 把所有非 2xx 响应都视为 failure，进入 retry + cooldown。AuthError（key 无效）不会永久标记为 Failed，而是会冷却一段时间后重试。

**自用场景下这通常不是问题**：key 填错时你会立即发现；某个 key 因额度/周限/5h 窗口耗尽而返回 429 时，会自动切换。

如果后续需要区分 AuthError（永久失效）和 RateLimit（临时冷却），可以在 `src/lib/router.ts` 的 `tryDeployment` 中增加错误分类逻辑。

### Cooldown 时长

- 基础冷却：2 分钟（`COOLDOWN_BASE = 120_000`）。
- 连续失败 3 次后进入更长的冷却（指数退避，最高约 15 分钟）。

可以在 `src/lib/router.ts` 顶部调整：

```ts
const COOLDOWN_BASE = 120_000;
const MAX_CONSECUTIVE_FAILS = 3;
```

### Sticky TTL

自动 sticky 持续 2 小时：

```ts
const STICKY_TTL_MS = 2 * 60 * 60 * 1000;
```

Dashboard 上可以手动 Pin 某个 Deployment，TTL 可以设很长。

## 开机自启动

当前是 `npm run dev` 开发模式。要设置为 Windows 开机启动：

1. 先构建：
   ```bash
   npm run build
   ```
2. 创建启动脚本 `start.ps1`：
   ```powershell
   $env:PORT = "3456"
   $env:ADMIN_KEY = "your-admin-key"
   $env:OPENCODE_GO_FALLBACK_MODEL = "opencode-go"
   $env:OPENCODE_GO_MODELS = "glm-5.2,glm-5.1,..."
   Set-Location "E:\Epheia\dev\dev_tool\llm-gateway"
   npm start
   ```
3. Windows Task Scheduler：
   - 触发器：**At log on**
   - 操作：启动 `powershell.exe`
   - 参数：`-ExecutionPolicy Bypass -File "E:\Epheia\dev\dev_tool\llm-gateway\start.ps1"`
   - 勾选：**无论用户是否登录都要运行**

注意：`gateway.db`（含 Provider API key）和 `.env.local` 不要进 git，已在 `.gitignore` 中排除。

## 后续维护

- OpenCode 新增模型：修改 `.env.local` 中的 `OPENCODE_GO_MODELS`，重启服务。
- 新增/更换 key：在 Web UI 的 Providers 页面编辑。
- 想查看路由 trace：Web UI 的 **LOGS** 页面或 Playground 页面。

## 相关提交

- Branch: `feat/opencode-go-pass-through`
- Commit: `ed1f07d`

## 上游调研文档

原始方案调研保存在父工作区：

```
E:\Epheia\dev\dev_tool\litellm\.swarm\2026-06-26_opencode-go-loadbalance\
```

包含 `research.md`、`architecture.md`、`fact-check.md`、`synthesis.md`。
