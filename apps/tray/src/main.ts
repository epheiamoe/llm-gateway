import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type ServiceState = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'pm2_missing';

interface StatusPayload {
  state: ServiceState;
  message?: string;
}

interface ErrorPayload {
  action: 'start' | 'stop' | 'restart';
  message: string;
}

const statusDot = document.getElementById('status-dot') as HTMLSpanElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const messageEl = document.getElementById('message') as HTMLParagraphElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement;
const btnDashboard = document.getElementById('btn-dashboard') as HTMLButtonElement;

const stateLabels: Record<ServiceState, string> = {
  running: 'Running',
  stopped: 'Stopped',
  starting: 'Starting...',
  stopping: 'Stopping...',
  error: 'Error',
  pm2_missing: 'pm2 not found',
};

function applyStatus(state: ServiceState, message?: string) {
  statusDot.className = 'dot ' + state;
  statusText.textContent = stateLabels[state] ?? state;
  messageEl.textContent = message ?? '';

  const disabled = state === 'pm2_missing';
  btnStart.disabled = disabled;
  btnStop.disabled = disabled;
  btnRestart.disabled = disabled;
  btnDashboard.disabled = disabled;
}

async function refreshStatus() {
  try {
    const status = await invoke<StatusPayload>('get_status');
    applyStatus(status.state, status.message);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    applyStatus('error', text);
  }
}

function wireButtons() {
  btnStart.addEventListener('click', async () => {
    try {
      await invoke('start_service');
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      messageEl.textContent = text;
    }
  });

  btnStop.addEventListener('click', async () => {
    try {
      await invoke('stop_service');
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      messageEl.textContent = text;
    }
  });

  btnRestart.addEventListener('click', async () => {
    try {
      await invoke('restart_service');
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      messageEl.textContent = text;
    }
  });

  btnDashboard.addEventListener('click', async () => {
    try {
      await invoke('open_dashboard');
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      messageEl.textContent = text;
    }
  });
}

async function subscribe() {
  await listen<StatusPayload>('status-changed', (event) => {
    applyStatus(event.payload.state, event.payload.message);
  });

  await listen<ErrorPayload>('service-error', (event) => {
    messageEl.textContent = `[${event.payload.action}] ${event.payload.message}`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireButtons();
  subscribe().catch(console.error);
  refreshStatus().catch(console.error);
});
