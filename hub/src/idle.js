import { log } from './log.js';

export function createIdle(session, registry, idleMs, pushControl) {
  let timer = null;
  let inFlight = 0;
  let stopped = false;

  function begin() {
    inFlight += 1;
    clearTimer();
    if (!session.idle) return;

    session.idle = false;
    refresh('agent.active');
  }

  function end() {
    if (inFlight > 0) inFlight -= 1;
    if (inFlight === 0) arm();
  }

  function stop() {
    stopped = true;
    clearTimer();
  }

  function arm() {
    clearTimer();
    if (stopped || idleMs === 0 || session.idle || inFlight > 0) return;
    timer = setTimeout(() => {
      timer = null;
      if (stopped || session.idle || inFlight > 0 || !session.browserId) return;
      session.idle = true;
      refresh('agent.idle');
    }, idleMs);
    timer.unref?.();
  }

  function clearTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function refresh(event) {
    if (!session.browserId) return;
    const browser = registry.browsers.get(session.browserId);
    log(event, { label: session.label, browser: browser?.name || session.browserId });
    pushControl(registry, browser);
  }

  return { begin, end, stop };
}
