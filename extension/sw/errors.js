// Structured error used by every tool so the hub/agent gets a code, not just prose.
export class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
