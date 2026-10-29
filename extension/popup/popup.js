const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get(['browserId', 'name', 'hubUrl', 'token']);
  $('name').value = s.name || '';
  $('hubUrl').value = s.hubUrl || 'ws://127.0.0.1:8777/ext';
  $('token').value = s.token || '';
  $('name').title = `id: ${s.browserId || '(not yet assigned)'}`;
  await refresh();
}

async function refresh() {
  let st;
  try { st = await chrome.runtime.sendMessage({ type: 'popup:status' }); } catch { st = null; }
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

$('save').addEventListener('click', async () => {
  const name = $('name').value.trim();
  const hubUrl = $('hubUrl').value.trim() || 'ws://127.0.0.1:8777/ext';
  const token = $('token').value;
  await chrome.storage.local.set({ ...(name ? { name } : {}), hubUrl, token });
  setTimeout(refresh, 600);
});

$('reconnect').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'popup:reconnect' }).catch(() => {});
  setTimeout(refresh, 800);
});

load();
setInterval(refresh, 2000);
