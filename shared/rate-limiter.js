export class RateLimiter {
  constructor(requestsPerSecond) {
    this.rps = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire() {
    this._refill();
    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) * (1000 / this.rps));
      await new Promise(r => setTimeout(r, waitMs));
      this._refill();
    }
    this.tokens -= 1;
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.rps, this.tokens + elapsed * this.rps);
    this.lastRefill = now;
  }
}
