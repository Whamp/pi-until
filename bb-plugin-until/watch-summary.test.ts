import { expect, it } from "vitest";

import type { BbWatchView } from "./bridge/bb-watch-protocol.ts";
import {
  formatBbWatchState,
  summarizeBbWatches,
  watchPhaseLabel,
} from "./watch-summary.ts";

const WATCH: BbWatchView = {
  id: "watch",
  label: "Review",
  kind: "recurring",
  status: "running",
  phase: "duePending",
  wake: "agent",
  attempts: 1,
  deliveries: 0,
  missedTicks: 0,
  intervalMs: 30_000,
  startedAt: 1,
  nextDueAt: 30_001,
};

it("does not confuse a pending wake with acknowledged running work", () => {
  expect(watchPhaseLabel(WATCH)).toBe("Wake pending");
  expect(watchPhaseLabel({ ...WATCH, phase: "awaitingSettlement" })).toBe(
    "Follow-up running"
  );
  expect(
    summarizeBbWatches([
      WATCH,
      { ...WATCH, id: "failed", status: "failed", phase: undefined },
    ])
  ).toEqual({ active: 1, pending: 1, failed: 1 });
});

it("CLI text distinguishes an empty live session from an unavailable session", () => {
  expect(
    formatBbWatchState({
      state: "live",
      sessionId: "session",
      instanceId: "instance",
      watches: [],
    })
  ).toBe("No pi-until watches in this live session.");
  expect(
    formatBbWatchState({ state: "unavailable", reason: "Host offline" })
  ).toBe("Host offline");
});
