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
ADMIN_KEY=37821f89dfd36d0a85df8b47597bbcf7
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

推荐方式：安装 **LLM Gateway Tray** 托盘应用，勾选"Auto-start on logon"。

- 托盘应用会在登录时静默启动（不弹窗口、不弹终端）。
- 托盘应用检测到服务未运行时会自动在后台启动 Gateway。
- 不再需要使用 Task Scheduler 或 `start.ps1`；旧任务已移除。

注意：`gateway.db`（含 Provider API key）和 `.env.local` 不要进 git，已在 `.gitignore` 中排除。

## Windows 托盘伴侣（推荐）

为了不用记端口号、不用打开浏览器输入地址，也为了方便在服务崩溃时一键启动，我们提供了一个 Windows 系统托盘应用。

### 功能

- 任务栏托盘图标实时显示服务状态：绿色（运行中）、黄色（启动/重启中）、红色（停止/错误）。
- 左键点击托盘图标打开状态窗口；**启动时不自动打开窗口**。
- 右键菜单：Open Dashboard、Start Service、Stop Service、Restart Service、Auto-start on logon、Exit。
- 托盘应用启动后会在后台自动启动 Gateway 服务（如果未运行）。
- 点击 Open Dashboard 时，如果服务未运行会自动先启动服务。
- 服务停止/崩溃时可点击 Start Service 重新拉起。

### 位置

```text
apps/tray/
```

### 构建安装包

需要：Node.js、Rust stable-msvc、WiX Toolset v3/v4（MSI）、NSIS（exe 安装包）。

```powershell
cd apps/tray
npm install
npm run tauri build
```

产物：

```text
apps/tray/src-tauri/target/release/bundle/
├── msi/LLM Gateway Tray_2.0.2_x64_en-US.msi
└── nsis/llm-gateway-tray_2.0.2_x64-setup.exe
```

### 安装使用

1. 运行 `.msi` 安装。
2. 从开始菜单启动 **LLM Gateway Tray**。
3. 可以固定到任务栏，获得一键打开。
4. 安装后首次启动会自动识别 `E:\Epheia\dev\dev_tool\llm-gateway`。如果 Gateway 放在其他位置，设置环境变量 `LLM_GATEWAY_HOME` 或创建 `%APPDATA%\llm-gateway-tray\config.json`：
   ```json
   { "gateway_home": "C:\\path\\to\\llm-gateway" }
   ```

### 注意事项

- 托盘应用本身不存储任何 API key 或 `ADMIN_KEY`。
- 托盘应用已替代 Task Scheduler 的 `llm-gateway-autostart`，旧任务已移除。
- 详细开发说明见 `apps/tray/README.md`。

## 后续维护

- OpenCode 新增模型：修改 `.env.local` 中的 `OPENCODE_GO_MODELS`，重启服务。
- 新增/更换 key：在 Web UI 的 Providers 页面编辑。
- 想查看路由 trace：Web UI 的 **LOGS** 页面或 Playground 页面。

## 相关提交

- Branch: `feat/opencode-go-pass-through`
- Commit: `5d922f8`

## 上游调研文档

原始方案调研保存在父工作区：

```
E:\Epheia\dev\dev_tool\litellm\.swarm\2026-06-26_opencode-go-loadbalance\
```

包含 `research.md`、`architecture.md`、`fact-check.md`、`synthesis.md`。
