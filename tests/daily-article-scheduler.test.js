import test from "node:test";
import assert from "node:assert/strict";
import {
  DailyArticleScheduler,
  getBeijingDateKey,
  getScheduledAt
} from "../backend/services/daily-article-scheduler.js";

function createTimerHarness() {
  const timers = [];
  return {
    timers,
    setTimer(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    }
  };
}

test("converts the daily 07:10 Beijing schedule to UTC", () => {
  assert.equal(getBeijingDateKey(new Date("2026-09-01T23:10:00Z")), "2026-09-02");
  assert.equal(getScheduledAt("2026-09-02").toISOString(), "2026-09-01T23:10:00.000Z");
});

test("runs at 07:10 Beijing and stops checking after the article is saved", async () => {
  let currentTime = new Date("2026-09-01T23:09:00Z");
  let imported = false;
  let syncCalls = 0;
  const harness = createTimerHarness();
  const scheduler = new DailyArticleScheduler({
    articleSync: {
      hasImportedDate: () => imported,
      async syncDate() {
        syncCalls += 1;
        imported = true;
        return { available: true };
      }
    },
    now: () => currentTime,
    setTimer: harness.setTimer,
    clearTimer: harness.clearTimer,
    logger: { log() {}, warn() {} }
  });

  scheduler.start();
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 60_000);

  currentTime = new Date("2026-09-01T23:10:00Z");
  await harness.timers.shift().callback();
  assert.equal(syncCalls, 1);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 24 * 60 * 60 * 1000);
  scheduler.stop();
});

test("retries failures and missing articles every five minutes until success", async () => {
  let currentTime = new Date("2026-09-01T23:10:00Z");
  let imported = false;
  let syncCalls = 0;
  const warnings = [];
  const harness = createTimerHarness();
  const scheduler = new DailyArticleScheduler({
    articleSync: {
      hasImportedDate: () => imported,
      async syncDate() {
        syncCalls += 1;
        if (syncCalls === 1) {
          const cause = Object.assign(new Error("network unreachable"), { code: "ENETUNREACH" });
          throw new TypeError("fetch failed", { cause });
        }
        if (syncCalls === 2) return { available: false };
        imported = true;
        return { available: true };
      }
    },
    now: () => currentTime,
    setTimer: harness.setTimer,
    clearTimer: harness.clearTimer,
    logger: { log() {}, warn(message) { warnings.push(message); } }
  });

  scheduler.start();
  assert.equal(harness.timers.shift().delay, 0);

  await scheduler.attempt("2026-09-02");
  assert.equal(harness.timers[0].delay, 5 * 60 * 1000);
  assert.match(warnings[0], /ENETUNREACH/);

  currentTime = new Date("2026-09-01T23:15:00Z");
  await harness.timers.shift().callback();
  assert.equal(harness.timers[0].delay, 5 * 60 * 1000);
  assert.match(warnings[1], /not available yet/);

  currentTime = new Date("2026-09-01T23:20:00Z");
  await harness.timers.shift().callback();
  assert.equal(syncCalls, 3);
  assert.equal(harness.timers.length, 1);
  assert.ok(harness.timers[0].delay > 23 * 60 * 60 * 1000);
  scheduler.stop();
});

test("service restart skips a date that is already stored locally", () => {
  const currentTime = new Date("2026-09-01T23:20:00Z");
  let syncCalls = 0;
  const harness = createTimerHarness();
  const scheduler = new DailyArticleScheduler({
    articleSync: {
      hasImportedDate: () => true,
      async syncDate() {
        syncCalls += 1;
        return { available: true };
      }
    },
    now: () => currentTime,
    setTimer: harness.setTimer,
    clearTimer: harness.clearTimer,
    logger: { log() {}, warn() {} }
  });

  scheduler.start();
  assert.equal(syncCalls, 0);
  assert.equal(harness.timers.length, 1);
  assert.ok(harness.timers[0].delay > 23 * 60 * 60 * 1000);
  scheduler.stop();
});
