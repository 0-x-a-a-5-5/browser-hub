# Browser Hub protocol

All messages are JSON text frames. The hub listens on `127.0.0.1:8777` (env `BROWSER_HUB_PORT`). On a
machine that reaches a hub elsewhere through `browser-hub-tunnel`, the same address is the tunnel's end.

## Extension side: `ws://127.0.0.1:8777/ext`

Origin must be `chrome-extension://…`.

| Direction | Message |
|---|---|
| ext → hub | `{type:"hello", browserId, name, token?, meta:{brands, platform, extensionVersion}}` |
| ext → hub | `{type:"ping"}` every 20 s; hub answers `{type:"pong"}` |
| ext → hub | `{type:"meta", name?, meta?}` when the user renames the browser |
| hub → ext | `{type:"req", id, method, params}` |
| ext → hub | `{type:"res", id, ok:true, result}` or `{type:"res", id, ok:false, error:{code, message}}` |
| hub → ext | `{type:"control", active:bool, agents:[{sessionId, label, color}]}` drives the border overlay |

A browser idle for 75 s (no frames) is dropped. Reconnecting with the same `browserId` replaces the old socket.

## Agent side: `ws://127.0.0.1:8777/agent`

Must **not** send an `Origin` header (browsers always do; that is how web pages are kept out).

| Direction | Message |
|---|---|
| agent → hub | `{type:"hello", label, token?, browser?}` (label is shown on the border; browser preselects) |
| hub → agent | `{type:"welcome", sessionId, color, selected, warning?}` |
| agent → hub | `{type:"req", id, method, params}` |
| hub → agent | `{type:"res", id, ok, result \| error}` |

One socket = one session. The session remembers the selected browser and the last tab it touched
(`currentTabId`); any method that needs a tab and is called without `tabId` uses it. Closing the socket
releases the browser (border goes off).

Hub-handled methods:

- `browsers.list` → `{browsers:[{id, name, selected, controlledBy:[labels], meta, summary}], selected}`
- `browser.select {browser}` (name or id) → `{selected:{id,name}, controlledBy}`
- `browser.deselect`
- `session.label {label}`

Everything else is forwarded to the selected browser's extension (or `params.browser` for a one-off):

| Method | Params | Result (always includes `tabId` for tab-scoped calls) |
|---|---|---|
| `browser.summary` | | `{windows, tabs, activeTabs}` |
| `browser.identify` | | flashes the border 2 s |
| `tabs.list` | | `{windows:[{windowId, focused, tabs:[{tabId, active, title, url}]}]}` |
| `tabs.create` | `url?, windowId?` | tab info, `loaded` |
| `tabs.close` | `tabId` | |
| `tabs.activate` | `tabId?` | tab info |
| `page.navigate` | `tabId?, url? \| action: back\|forward\|reload, timeoutMs?` | tab info, `loaded` |
| `page.screenshot` | `tabId?, format? png\|jpeg, quality?, includeOverlay?` | `{width, height, image:{mimeType, base64}}` in CSS px |
| `page.snapshot` | `tabId?, filter? interactive\|all, maxItems?, coords?` | `{url, title, count, truncated, text}` |
| `page.find` | `tabId?, text?, selector?, role?, limit?` | `{count, total, text}` with refs and `@x,y` |
| `page.text` | `tabId?, selector?, maxChars?` | `{text, length, truncated}` |
| `page.click` | `tabId?, ref? \| x,y, button?, clickCount?, trusted?` | plus `navigated/url` if it caused a load |
| `page.fill` | `tabId?, ref, value` | control state after the change |
| `page.type` | `tabId?, text, pressEnter?` | |
| `page.key` | `tabId?, key` e.g. `ctrl+shift+t` | |
| `page.scroll` | `tabId?, ref? \| x,y,deltaX,deltaY \| deltaX,deltaY` | viewport + scroll position |
| `page.hover` | `tabId?, ref? \| x,y` | |
| `page.wait` | `tabId?, selector? \| text? \| ms, timeoutMs?` | `{found, elapsedMs}` |
| `page.evaluate` | `tabId?, expression` | `{type, value}` or `{type, description}` |
| `page.console` | `tabId?, level?, pattern?, clear?, limit?` | `{messages:[{ts, level, text, source?}]}` |
| `page.network` | `tabId?, pattern?, clear?, limit?` | `{requests:[{ts, method, url, type, status, durationMs, error?}]}` |
| `window.resize` | `windowId? \| tabId?, width, height` | |
| `window.list` | | |

Error codes you will meet: `NO_BROWSERS`, `AMBIGUOUS_BROWSER`, `NO_SUCH_BROWSER`, `BROWSER_GONE`,
`NO_TAB`, `NO_PAGE_ACCESS`, `STALE_REF`, `DEBUGGER_ATTACH_FAILED`, `JS_EXCEPTION`, `TIMEOUT`, `BAD_PARAMS`.

## HTTP (stateless)

- `GET /health`
- `GET /browsers`
- `POST /call` with `Content-Type: application/json` and body `{browser?, method, params?}` → `{ok, result|error}`.
  Stateless calls do not hold the border; the targeted tab just pulses.

If `BROWSER_HUB_TOKEN` is set on the hub, extensions and agents must send it in `hello` and HTTP calls need
`Authorization: Bearer <token>`.
