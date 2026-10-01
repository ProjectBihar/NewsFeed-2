// Per-domain concurrency throttle (Phase 5).
// Crawlee caps concurrency globally; this semaphore enforces the
// per-domain limit (default 2) inside the request handler.
export class DomainThrottle {
  private readonly limit: number;
  private readonly active = new Map<string, number>();
  private readonly waiting = new Map<string, Array<() => void>>();

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`DomainThrottle limit must be a positive integer, got ${limit}`);
    }
    this.limit = limit;
  }

  async acquire(host: string): Promise<() => void> {
    const running = this.active.get(host) ?? 0;
    if (running < this.limit) {
      this.active.set(host, running + 1);
      return () => this.release(host);
    }
    await new Promise<void>((resolve) => {
      const queue = this.waiting.get(host) ?? [];
      queue.push(resolve);
      this.waiting.set(host, queue);
    });
    // Slot transferred directly from the releaser; the count is unchanged.
    return () => this.release(host);
  }

  private release(host: string): void {
    const queue = this.waiting.get(host);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this.waiting.delete(host);
      // Hand the slot to the waiter: active count unchanged.
      next();
      return;
    }
    const running = (this.active.get(host) ?? 1) - 1;
    if (running <= 0) this.active.delete(host);
    else this.active.set(host, running);
  }

  inFlight(host: string): number {
    return this.active.get(host) ?? 0;
  }
}
