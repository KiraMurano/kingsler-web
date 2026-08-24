// Centralized Timer and Interval Manager for the Game Engine

// Portable handle types: the browser's setTimeout/setInterval return a
// number, Node's return a Timeout object. This engine runs in both (browser
// tab offline, worker_thread online), so the handle type must not assume one.
type TimeoutHandle = ReturnType<typeof globalThis.setTimeout>;
type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

class TimerManager {
  private countdownInterval: IntervalHandle | null = null;
  private delayTimeout: TimeoutHandle | null = null;

  public clearAll(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.delayTimeout !== null) {
      clearTimeout(this.delayTimeout);
      this.delayTimeout = null;
    }
  }

  public scheduleDelay(callback: () => void, delayMs: number): void {
    if (this.delayTimeout !== null) {
      clearTimeout(this.delayTimeout);
    }
    this.delayTimeout = globalThis.setTimeout(() => {
      this.delayTimeout = null;
      callback();
    }, delayMs);
  }

  public startCountdown(
    initialSeconds: number,
    onTick: (remainingSeconds: number) => void,
    onComplete: () => void
  ): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
    }

    let remaining = initialSeconds;
    this.countdownInterval = globalThis.setInterval(() => {
      if (remaining <= 1) {
        this.clearAll();
        onComplete();
      } else {
        remaining -= 1;
        onTick(remaining);
      }
    }, 1000);
  }
}

export const timerManager = new TimerManager();
