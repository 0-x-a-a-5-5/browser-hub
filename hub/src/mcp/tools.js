// MCP tool catalogue. Each tool maps 1:1 to a hub method; the hub fills in the default
// browser and tab, so every tabId/browser parameter is optional.
const TAB = { tabId: { type: 'integer', description: 'Tab to act on. Defaults to the tab used by the previous call, else the active tab.' } };
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const TOOLS = [
  {
    name: 'browsers_list', method: 'browsers.list',
    description: 'List Chrome profiles connected to the hub (name, id, open windows/tabs, which agents control them, which one this session has selected). Call this first when more than one browser may be connected.',
    inputSchema: obj(),
  },
  {
    name: 'browser_select', method: 'browser.select',
    description: 'Choose which connected browser this session controls, by name or id. The chosen browser shows a colored border with this session\'s label. Required when several browsers are connected; optional when only one is.',
    inputSchema: obj({ browser: { type: 'string', description: 'Browser name (as set in the extension popup) or id' } }, ['browser']),
  },
  {
    name: 'browser_identify', method: 'browser.identify',
    description: 'Flash the border in every window of the selected browser for two seconds so the user can see which Chrome profile it is.',
    inputSchema: obj({ browser: { type: 'string', description: 'Browser to flash; defaults to the selected one' } }),
  },
  {
    name: 'tabs_list', method: 'tabs.list',
    description: 'All windows and tabs of the selected browser with tabId, windowId, title, url and which tab is active.',
    inputSchema: obj(),
  },
  {
    name: 'tab_new', method: 'tabs.create',
    description: 'Open a new tab (optionally at a URL) and wait for it to load. The new tab becomes the default for later calls.',
    inputSchema: obj({ url: { type: 'string' }, windowId: { type: 'integer', description: 'Window to open it in; defaults to the current window' } }),
  },
  { name: 'tab_close', method: 'tabs.close', description: 'Close a tab.', inputSchema: obj({ tabId: { type: 'integer' } }, ['tabId']) },
  { name: 'tab_activate', method: 'tabs.activate', description: 'Bring a tab to the front and focus its window.', inputSchema: obj(TAB) },
  {
    name: 'navigate', method: 'page.navigate',
    description: 'Load a URL in a tab, or go back/forward/reload. Waits for the page to finish loading (up to timeoutMs).',
    inputSchema: obj({ ...TAB, url: { type: 'string' }, action: { type: 'string', enum: ['back', 'forward', 'reload'] }, timeoutMs: { type: 'integer' } }),
  },
  {
    name: 'screenshot', method: 'page.screenshot',
    description: 'Screenshot of the visible part of a tab, in CSS pixels, so x/y from the image can be passed straight to click/hover/scroll. Activates the tab if needed.',
    inputSchema: obj({ ...TAB, format: { type: 'string', enum: ['png', 'jpeg'] }, quality: { type: 'integer', description: 'JPEG quality 1-100' }, includeOverlay: { type: 'boolean', description: 'Keep the agent border/label visible in the image (hidden by default)' } }),
  },
  {
    name: 'read_page', method: 'page.snapshot', textField: 'text',
    description: 'Compact outline of the page: interactive elements (links, buttons, inputs...) with refs like [e12] plus headings/landmarks. Use the refs with click/fill/hover/scroll. filter="all" also includes visible text blocks and images. Refs stay valid until the element leaves the DOM.',
    inputSchema: obj({ ...TAB, filter: { type: 'string', enum: ['interactive', 'all'] }, maxItems: { type: 'integer' }, coords: { type: 'boolean', description: 'Append the center @x,y of each element' } }),
  },
  {
    name: 'find', method: 'page.find', textField: 'text',
    description: 'Find elements by visible text/label (case-insensitive substring), CSS selector and/or role (button, link, textbox, checkbox, heading, clickable...). Returns matching elements with refs and center coordinates.',
    inputSchema: obj({ ...TAB, text: { type: 'string' }, selector: { type: 'string' }, role: { type: 'string' }, limit: { type: 'integer' } }),
  },
  {
    name: 'get_text', method: 'page.text', textField: 'text',
    description: 'Visible text of the page (or of the first element matching selector), like selecting all and copying.',
    inputSchema: obj({ ...TAB, selector: { type: 'string' }, maxChars: { type: 'integer' } }),
  },
  {
    name: 'click', method: 'page.click',
    description: 'Click an element by ref (from read_page/find) or at viewport coordinates x,y (from a screenshot). Ref clicks are dispatched on the element; coordinate clicks and trusted=true send real mouse events through the debugger (Chrome shows a "debugging" banner). Waits briefly for any navigation the click starts.',
    inputSchema: obj({ ...TAB, ref: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string', enum: ['left', 'right', 'middle'] }, clickCount: { type: 'integer', description: '2 for double-click' }, trusted: { type: 'boolean', description: 'With ref: click its center with real mouse events instead of DOM events' } }),
  },
  {
    name: 'fill', method: 'page.fill',
    description: 'Set the value of a form control by ref: text inputs and textareas (fires input/change so React/Vue notice), selects (match option by value or text), checkboxes/radios (true/false), contenteditable editors. Faster than typing; use type for keystroke-driven widgets.',
    inputSchema: obj({ ...TAB, ref: { type: 'string' }, value: { type: ['string', 'boolean', 'number'] } }, ['ref', 'value']),
  },
  {
    name: 'type', method: 'page.type',
    description: 'Type text with real keystrokes into whatever is focused (click a field first). Set pressEnter to submit afterwards.',
    inputSchema: obj({ ...TAB, text: { type: 'string' }, pressEnter: { type: 'boolean' } }, ['text']),
  },
  {
    name: 'press_key', method: 'page.key',
    description: 'Press a key or chord with real key events: "Enter", "Escape", "Tab", "ArrowDown", "ctrl+a", "ctrl+shift+t", "meta+c".',
    inputSchema: obj({ ...TAB, key: { type: 'string' } }, ['key']),
  },
  {
    name: 'scroll', method: 'page.scroll',
    description: 'Scroll: give ref to scroll an element into view; or x,y plus deltaX/deltaY to wheel-scroll whatever is under that point; or just deltaX/deltaY to scroll the page. Returns scroll position and viewport size.',
    inputSchema: obj({ ...TAB, ref: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, deltaX: { type: 'number' }, deltaY: { type: 'number', description: 'Positive scrolls down' } }),
  },
  { name: 'hover', method: 'page.hover', description: 'Move the mouse over an element (ref) or point (x,y) to trigger hover menus/tooltips.', inputSchema: obj({ ...TAB, ref: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }) },
  {
    name: 'evaluate', method: 'page.evaluate',
    description: 'Run a JavaScript expression in the page and return its JSON-serializable result (promises are awaited). Runs via the debugger, so page CSP does not block it.',
    inputSchema: obj({ ...TAB, expression: { type: 'string' } }, ['expression']),
  },
  {
    name: 'wait_for', method: 'page.wait',
    description: 'Wait until a CSS selector matches a visible element, until text appears on the page, or simply for ms milliseconds.',
    inputSchema: obj({ ...TAB, selector: { type: 'string' }, text: { type: 'string' }, ms: { type: 'integer' }, timeoutMs: { type: 'integer' } }),
  },
  {
    name: 'console_read', method: 'page.console',
    description: 'Console output and uncaught errors recorded in the tab since it loaded. Filter by level (log|info|warn|error|debug) and/or a regex pattern.',
    inputSchema: obj({ ...TAB, level: { type: 'string' }, pattern: { type: 'string' }, clear: { type: 'boolean' }, limit: { type: 'integer' } }),
  },
  {
    name: 'network_read', method: 'page.network',
    description: 'Requests made by the tab (method, url, type, status, duration, errors), most recent last. Filter urls with a regex pattern.',
    inputSchema: obj({ ...TAB, pattern: { type: 'string' }, clear: { type: 'boolean' }, limit: { type: 'integer' } }),
  },
  {
    name: 'window_resize', method: 'window.resize',
    description: 'Resize the browser window that holds the current tab (or windowId).',
    inputSchema: obj({ windowId: { type: 'integer' }, ...TAB, width: { type: 'integer' }, height: { type: 'integer' } }, ['width', 'height']),
  },
];

export const toolsByName = new Map(TOOLS.map((t) => [t.name, t]));
