export class HubError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const hubError = (code, message) => new HubError(code, message);
