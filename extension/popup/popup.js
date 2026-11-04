const $ = (id) => document.getElementById(id);
const DEFAULT_HUB_URL = 'ws://127.0.0.1:8777/ext';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load() {
  const s = await chrome.storage.local.get(['browserId', 'name', 'hubUrl', 'token']);
  $('name').value = s.name || '';
  $('hubUrl').value = s.hubUrl || DEFAULT_HUB_URL;
  $('token').value = s.token || '';
  $('name').title = `id: ${s.browserId || '(not yet assigned)'}`;
  await refresh();
}

async function getStatus() {
  try { return await chrome.runtime.sendMessage({ type: 'popup:status' }); } catch { return null; }
}

async function refresh() {
  render(await getStatus());
}

function render(st) {
  const connected = !!st?.connected;
  $('dot').classList.toggle('on', connected);
  $('status').textContent = connected
    ? `Connected to ${st.hubUrl}`
    : `Not connected${st?.lastError ? ` (${st.lastError})` : ''}. Is browser-hub running?`;
  const agents = st?.control?.agents || [];
  $('controllers').innerHTML = agents.length
    ? 'Controlled by: ' + agents.map((a) => `<span class="pill" style="background:${a.color || '#ff2d55'}">${escapeHtml(a.label || 'agent')}</span>`).join('')
    : '<span style="color:#6b7280">No agent is controlling this browser.</span>';
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function readForm() {
  return { name: $('name').value.trim(), hubUrl: $('hubUrl').value.trim() || DEFAULT_HUB_URL, token: $('token').value };
}

// Stores the form. A changed value makes the service worker reconnect by itself (it watches
// storage); an unchanged one fires no storage event, so ask for the reconnect explicitly.
async function saveAndReconnect() {
  const form = readForm();
  const next = { ...(form.name ? { name: form.name } : {}), hubUrl: form.hubUrl, token: form.token };
  const stored = await chrome.storage.local.get(Object.keys(next));
  const changed = Object.keys(next).some((k) => (stored[k] ?? '') !== next[k]);
  if (changed) await chrome.storage.local.set(next);
  else await requestReconnect();
}

function requestReconnect() {
  return chrome.runtime.sendMessage({ type: 'popup:reconnect' }).catch(() => {});
}

// Polls until the hub has accepted a connection made after `since`, or the timeout passes.
// A service worker older than this popup reports no acceptedAt; then any live connection counts.
async function waitForConnection(since, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let status = null;
  while (Date.now() < deadline) {
    status = await getStatus();
    const fresh = status?.acceptedAt === undefined || status.acceptedAt >= since;
    if (status?.connected && fresh) return { ok: true, status };
    await sleep(150);
  }
  return { ok: false, status };
}

// Click feedback: the button is disabled with a busy label while the action runs, then shows the
// outcome in green or red for a moment before returning to its normal label.
async function withFeedback(button, labels, action) {
  const idle = button.textContent;
  button.style.minWidth = `${button.offsetWidth}px`; // keep the width steady while the label changes
  button.disabled = true;
  button.classList.add('busy');
  button.textContent = labels.busy;
  const since = Date.now();
  let ok = false;
  try {
    await action();
    const result = await waitForConnection(since);
    ok = result.ok;
    render(result.status);
  } catch (e) {
    $('status').textContent = `Failed: ${e.message}`;
  }
  button.classList.replace('busy', ok ? 'ok' : 'fail');
  button.textContent = ok ? labels.ok : labels.fail;
  await sleep(1600);
  button.classList.remove('ok', 'fail');
  button.textContent = idle;
  button.style.minWidth = '';
  button.disabled = false;
}

$('save').addEventListener('click', (ev) => withFeedback(ev.currentTarget,
  { busy: 'Saving…', ok: 'Saved ✓', fail: 'Saved, not connected' }, saveAndReconnect));

$('reconnect').addEventListener('click', (ev) => withFeedback(ev.currentTarget,
  { busy: 'Reconnecting…', ok: 'Connected ✓', fail: 'Not connected' }, requestReconnect));

load();
setInterval(refresh, 2000);
