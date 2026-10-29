// Who this browser profile is: a stable id generated once, a user-editable name,
// and where to find the hub. All persisted in chrome.storage.local (per profile).
const DEFAULT_HUB_URL = 'ws://127.0.0.1:8777/ext';

export async function loadIdentity() {
  const s = await chrome.storage.local.get(['browserId', 'name', 'hubUrl', 'token']);
  let { browserId, name } = s;
  if (!browserId) {
    browserId = crypto.randomUUID();
    await chrome.storage.local.set({ browserId });
  }
  if (!name) {
    name = 'browser-' + browserId.slice(0, 6);
    await chrome.storage.local.set({ name });
  }
  return { browserId, name, hubUrl: s.hubUrl || DEFAULT_HUB_URL, token: s.token || '' };
}

// Calls cb(identity) whenever the user changes name/hub/token in the popup.
export function watchIdentity(cb) {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if ('name' in changes || 'hubUrl' in changes || 'token' in changes) cb(await loadIdentity());
  });
}
