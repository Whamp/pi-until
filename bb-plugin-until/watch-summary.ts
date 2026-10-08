import type { BbWatchState, BbWatchView } from "./bridge/bb-watch-protocol.ts";

/** Pending delivery is distinct from a follow-up that Pi has acknowledged. */
export function watchPhaseLabel(watch: BbWatchView): string {
  if (watch.status !== "running") {
    return watch.status;
  }
  switch (watch.phase) {
    case "checking": {
      return "Checking";
    }
    case "duePending": {
      return "Wake pending";
    }
    case "awaitingSettlement": {
      return "Follow-up running";
    }
    case "sleeping": {
      return "Sleeping";
    }
    case undefined: {
      return "Running";
    }
    default: {
      const impossible: never = watch.phase;
      throw new Error("Unknown pi-until phase", { cause: impossible });
    }
  }
}

/** Bounded CLI text contains only fields from the safe watch snapshot. */
export function formatBbWatchState(state: BbWatchState): string {
  if (state.state === "unavailable") {
    return state.reason;
  }
  if (state.watches.length === 0) {
    return "No pi-until watches in this live session.";
  }
  return state.watches
    .map(
      (watch) =>
        `${watch.id}\t${watch.label}\t${watch.phase ?? watch.status}\tchecks=${watch.attempts}\twakes=${watch.deliveries}`
    )
    .join("\n");
}

/** Counts come from live watch states, never from thread execution status. */
export function summarizeBbWatches(watches: readonly BbWatchView[]) {
  return {
    active: watches.filter((watch) => watch.status === "running").length,
    pending: watches.filter(
      (watch) => watch.status === "running" && watch.phase === "duePending"
    ).length,
    failed: watches.filter(
      (watch) =>
        watch.status === "failed" ||
        watch.status === "expired" ||
        watch.status === "timedOut"
    ).length,
  };
}
