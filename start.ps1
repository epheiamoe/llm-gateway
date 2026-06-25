# Auto-generated llm-gateway startup script
# Restarts pm2-managed llm-gateway on logon

Set-Location "E:\Epheia\dev\dev_tool\llm-gateway"

# Ensure production build exists
if (-not (Test-Path ".next\BUILD_ID")) {
    & npm run build
}

# Ensure pm2 resurrects saved processes
& "$env:APPDATA\npm\pm2.cmd" resurrect

# Also explicitly restart llm-gateway (loads .env.local automatically)
& "$env:APPDATA\npm\pm2.cmd" restart "E:\Epheia\dev\dev_tool\llm-gateway\pm2.config.json" 2>$null
