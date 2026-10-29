// Resolve when a tab finishes a navigation (or the timeout passes). Register the
// listeners BEFORE triggering the navigation to avoid missing a fast load.
export function waitForLoad(tabId, timeoutMs = 20_000) {
  let settle;
  const promise = new Promise((resolve) => { settle = resolve; });
  const finish = (loaded) => { cleanup(); settle({ loaded }); };
  const onUpdated = (id, info) => { if (id === tabId && info.status === 'complete') finish(true); };
  const onNav = (d) => { if (d.tabId === tabId && d.frameId === 0) finish(true); };
  const onErr = (d) => { if (d.tabId === tabId && d.frameId === 0) finish(false); };
  const timer = setTimeout(() => finish(false), timeoutMs);

  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.webNavigation.onCompleted.addListener(onNav);
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(onNav);
  chrome.webNavigation.onHistoryStateUpdated.addListener(onNav);
  chrome.webNavigation.onErrorOccurred.addListener(onErr);

  function cleanup() {
    clearTimeout(timer);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.webNavigation.onCompleted.removeListener(onNav);
    chrome.webNavigation.onReferenceFragmentUpdated.removeListener(onNav);
    chrome.webNavigation.onHistoryStateUpdated.removeListener(onNav);
    chrome.webNavigation.onErrorOccurred.removeListener(onErr);
  }
  promise.cancel = cleanup;
  return promise;
}

// After a click/keypress: if the tab started loading, wait for it to finish.
export async function settle(tabId, { maxWaitMs = 8000 } = {}) {
  await new Promise((r) => setTimeout(r, 120));
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return { tabClosed: true }; }
  if (tab.status !== 'loading') return { url: tab.url };
  const { loaded } = await waitForLoad(tabId, maxWaitMs);
  tab = await chrome.tabs.get(tabId);
  return { navigated: true, loaded, url: tab.url, title: tab.title };
}
