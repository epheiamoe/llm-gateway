# LLM Gateway Tray Companion

A lightweight Windows system-tray application built with [Tauri 2](https://tauri.app/) for monitoring and controlling the local `llm-gateway` service.

## Features

- Live tray icon color indicating gateway status (green = running, yellow = starting, red = stopped/error).
- Left-click tray icon to open the status window.
- Right-click tray menu with Open Dashboard, Start/Stop/Restart Service, Auto-start toggle, and Exit.
- Automatic service start when opening the dashboard while the gateway is stopped.
- Graceful handling when `pm2` cannot be found.

## Project Layout

```text
apps/tray/
├── src-tauri/           # Rust backend
│   ├── src/
│   │   ├── main.rs      # App entry, polling, plugins
│   │   ├── config.rs    # Gateway home resolution
│   │   ├── pm2.rs       # pm2 discovery and commands
│   │   ├── health.rs    # /api/health polling
│   │   ├── state.rs     # Shared tray state
│   │   ├── tray.rs      # Tray icon, menu, events
│   │   ├── window.rs    # Status/dashboard windows
│   │   ├── autostart.rs # tauri-plugin-autostart wrapper
│   │   └── commands.rs  # Commands exposed to the frontend
│   ├── capabilities/
│   │   └── default.json # Tauri capability permissions
│   ├── icons/           # Tray / bundle icons
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── src/
│   ├── main.ts          # Status window frontend
│   └── style.css
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Development

Requires:

- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://rustup.rs/) stable-msvc
- `pm2` installed globally and available on PATH or in common npm/Node locations
- A production build of `llm-gateway` at the gateway home (`<gateway_home>/.next/BUILD_ID`)

```powershell
cd apps/tray
npm install
npm run tauri dev
```

The status window will open automatically. The tray icon appears in the system tray area.

## Production Build

```powershell
cd apps/tray
npm run tauri build
```

This produces:

```text
src-tauri/target/release/
├── llm-gateway-tray.exe
└── bundle/
    ├── msi/LLM Gateway Tray_2.0.0_x64_en-US.msi
    └── nsis/llm-gateway-tray_2.0.0_x64-setup.exe
```

Required Windows bundling tools:

- [WiX Toolset v3 or v4](https://wixtoolset.org/) for `.msi`
- [NSIS](https://nsis.sourceforge.io/) for `.exe` installer

Installers are produced locally and must **not** be committed.

## Configuration

The tray app resolves the gateway home directory in this order:

1. `LLM_GATEWAY_HOME` environment variable.
2. `%APPDATA%\llm-gateway-tray\config.json` → `gateway_home`.
3. Built-in fallback: `E:\Epheia\dev\dev_tool\llm-gateway`.

The directory must contain `pm2.config.json`.

You can override the `pm2` binary location with `TRAY_PM2_PATH`.

## Security Notes

- No API keys or `ADMIN_KEY` are embedded in the tray source.
- The tray app does not read the gateway `.env.local` file.
- All shell commands use absolute paths and structured arguments.
- Installer artifacts and build output are excluded from git by `.gitignore`.
