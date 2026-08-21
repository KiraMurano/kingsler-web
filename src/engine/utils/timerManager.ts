// Centralized Timer and Interval Manager for the Game Engine

class TimerManager {
  private countdownInterval: number | null = null;
  private delayTimeout: number | null = null;

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
    this.delayTimeout = window.setTimeout(() => {
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
    this.countdownInterval = window.setInterval(() => {
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
