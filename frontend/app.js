/* ─────────────────────────────────────────
   GitOps Dashboard — app.js
   Fetch API + auto-refresh every 30s
   ───────────────────────────────────────── */

const API = '/api';
const REFRESH_INTERVAL = 30; // seconds

let countdown = REFRESH_INTERVAL;
let refreshTimer = null;
let countdownTimer = null;

// ── Helpers ──────────────────────────────

function $(id) { return document.getElementById(id); }

async function fetchJSON(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.json();
}

function setGlobalStatus(ok) {
  const dot  = $('pulse-dot');
  const text = $('status-text');
  const badge = $('global-status');
  if (ok) {
    dot.className  = 'pulse-dot';
    text.textContent = 'Connected';
    badge.style.borderColor = 'rgba(0, 212, 161, 0.35)';
  } else {
    dot.className  = 'pulse-dot error';
    text.textContent = 'Disconnected';
    badge.style.borderColor = 'rgba(248, 113, 113, 0.35)';
  }
}

function infoRow(key, value, extraClass = '') {
  return `<div class="info-row">
    <span class="info-key">${key}</span>
    <span class="info-val ${extraClass}">${value ?? '—'}</span>
  </div>`;
}

// ── Data loaders ─────────────────────────

async function loadHealth() {
  try {
    const d = await fetchJSON('/health');

    $('api-status-val').textContent = d.status === 'ok' ? 'Healthy ✓' : 'Degraded';
    $('uptime-val').textContent = d.uptime_human ?? '—';

    const isOk = d.status === 'ok';

    // Health card
    $('health-label').textContent = isOk ? 'All Systems Go' : 'Service Degraded';
    $('health-uptime').textContent = `Uptime: ${d.uptime_human ?? '—'}`;

    // Ring indicator — full circle on healthy
    const fill = $('ring-fill');
    const icon = $('ring-icon');
    if (isOk) {
      fill.classList.remove('error');
      icon.classList.remove('error');
      fill.style.strokeDashoffset = '0';
    } else {
      fill.classList.add('error');
      icon.classList.add('error');
      fill.style.strokeDashoffset = '100';
    }

    setGlobalStatus(true);
  } catch (err) {
    console.error('[health]', err);
    $('api-status-val').textContent = 'Error ✗';
    $('health-label').textContent   = 'Unavailable';
    $('ring-fill').classList.add('error');
    $('ring-icon').classList.add('error');
    $('ring-fill').style.strokeDashoffset = '100';
    setGlobalStatus(false);
  }
}

async function loadInfo() {
  try {
    const d = await fetchJSON('/info');

    $('env-val').textContent = d.environment ?? '—';

    $('info-list').innerHTML = [
      ['App',         d.app],
      ['Version',     d.version],
      ['Environment', d.environment],
      ['Namespace',   d.namespace],
      ['Git Repo',    d.git_repo],
      ['Deployed By', d.deployed_by],
    ].map(([k, v]) => infoRow(k, v)).join('');

    $('pod-list').innerHTML = [
      ['Pod Name',  d.pod_name],
      ['Node Name', d.node_name],
      ['Namespace', d.namespace],
    ].map(([k, v]) => infoRow(k, v, 'pod-val')).join('');

  } catch (err) {
    console.error('[info]', err);
    const msg = '<div style="color:var(--danger);font-size:13px;padding-top:12px;">⚠ Failed to load</div>';
    $('info-list').innerHTML = msg;
    $('pod-list').innerHTML  = msg;
  }
}

async function loadMessage() {
  try {
    const d = await fetchJSON('/message');
    $('message-display').textContent = `"${d.message}"`;
    $('message-source').textContent  = d.source ?? 'configmap';
  } catch (err) {
    console.error('[message]', err);
    $('message-display').innerHTML = '<span style="color:var(--danger)">⚠ Failed to load message</span>';
  }
}

// ── Countdown & refresh ───────────────────

function tickCountdown() {
  const el = $('refresh-countdown');
  if (!el) return;
  countdown--;
  if (countdown <= 0) {
    countdown = REFRESH_INTERVAL;
    el.textContent = 'Refreshing…';
  } else {
    el.textContent = `Refresh in ${countdown}s`;
  }
}

async function refreshAll() {
  countdown = REFRESH_INTERVAL;
  $('refresh-countdown').textContent = `Refresh in ${REFRESH_INTERVAL}s`;
  await Promise.allSettled([loadHealth(), loadInfo(), loadMessage()]);
}

// ── Entry point ───────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Initial load
  refreshAll();

  // Countdown display
  countdownTimer = setInterval(tickCountdown, 1000);

  // Periodic refresh
  refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL * 1000);
});
