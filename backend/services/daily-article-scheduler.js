const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const SCHEDULE_HOUR = 7;
const SCHEDULE_MINUTE = 10;
const DEFAULT_RETRY_INTERVAL_MS = 5 * 60 * 1000;

export function getBeijingDateKey(date) {
  return new Date(date.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function getScheduledAt(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(
    year,
    month - 1,
    day,
    SCHEDULE_HOUR - 8,
    SCHEDULE_MINUTE
  ));
}

function describeError(error) {
  const messages = [];
  let current = error;
  while (current && messages.length < 3) {
    const detail = current.code ? `${current.message} (${current.code})` : current.message;
    if (detail && !messages.includes(detail)) messages.push(detail);
    current = current.cause;
  }
  return messages.join(" | ") || String(error);
}

export class DailyArticleScheduler {
  constructor({
    articleSync,
    retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
    now = () => new Date(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    logger = console
  }) {
    this.articleSync = articleSync;
    this.retryIntervalMs = retryIntervalMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.logger = logger;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.planFromCurrentTime();
  }

  stop() {
    this.running = false;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
  }

  planFromCurrentTime() {
    const current = this.now();
    const dateKey = getBeijingDateKey(current);
    const scheduledAt = getScheduledAt(dateKey);

    if (current < scheduledAt) {
      this.schedule(dateKey, scheduledAt.getTime() - current.getTime());
      return;
    }

    if (this.articleSync.hasImportedDate(dateKey)) {
      this.logger.log(`Daily article ${dateKey} is already saved; no more checks today.`);
      this.scheduleNextDay(dateKey);
      return;
    }

    this.schedule(dateKey, 0);
  }

  schedule(dateKey, delayMs) {
    if (!this.running) return;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = null;
      return this.attempt(dateKey);
    }, Math.max(0, delayMs));
    this.timer?.unref?.();
  }

  async attempt(dateKey) {
    if (!this.running) return;

    if (this.articleSync.hasImportedDate(dateKey)) {
      this.complete(dateKey);
      return;
    }

    try {
      const result = await this.articleSync.syncDate(dateKey);
      if (result.available) {
        this.logger.log(`Daily article ${dateKey} was saved successfully.`);
        this.complete(dateKey);
        return;
      }
      this.logger.warn(
        `Daily article ${dateKey} is not available yet; retrying in ${this.retryIntervalMs / 60_000} minutes.`
      );
    } catch (error) {
      this.logger.warn(
        `Daily article ${dateKey} sync failed; retrying in ${this.retryIntervalMs / 60_000} minutes: ${describeError(error)}`
      );
    }

    this.schedule(dateKey, this.retryIntervalMs);
  }

  complete(dateKey) {
    this.scheduleNextDay(dateKey);
  }

  scheduleNextDay(dateKey) {
    const nextDateKey = addDays(dateKey, 1);
    const delayMs = Math.max(0, getScheduledAt(nextDateKey).getTime() - this.now().getTime());
    this.schedule(nextDateKey, delayMs);
  }
}
