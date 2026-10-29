// Tracks which agents control this browser and which tab was last acted on, and
// pushes that state to the overlay content script in every tab (plus the badge).
import * as dbg from './debugger.js';

let state = { active: false, agents: [] };
let targetTabId = null;

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === targetTabId) targetTabId = null;
});

export function apply({ active, agents }) {
  state = { active: !!active, agents: agents || [] };
  updateBadge();
  broadcast();
  if (!state.active) {
    targetTabId = null;
    dbg.detachAll();
  }
}

export function current() {
  return state;
}

export function stateForTab(tabId) {
  return { active: state.active, agents: state.agents, isTarget: tabId != null && tabId === targetTabId };
}

// Called after every tool call that touched a tab: moves the strong border there and pulses it.
export function markTarget(tabId) {
  const prev = targetTabId;
  targetTabId = tabId;
  if (prev != null && prev !== tabId) sendTo(prev, { type: 'overlay:set', ...stateForTab(prev) });
  sendTo(tabId, { type: 'overlay:set', ...stateForTab(tabId), pulse: true });
}

export async function flashAll() {
  await broadcast({ flash: true });
}

async function broadcast(extra = {}) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) sendTo(t.id, { type: 'overlay:set', ...stateForTab(t.id), ...extra });
}

function sendTo(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => { /* no content script on this page */ });
}

function updateBadge() {
  if (state.active) {
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: state.agents[0]?.color || '#ff2d55' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}
