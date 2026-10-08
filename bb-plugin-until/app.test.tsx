// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { z } from "zod";

import type { BbWatchState, BbWatchView } from "./bridge/bb-watch-protocol.ts";
import { watchRpcContract } from "./watch-contract.ts";

const WATCH: BbWatchView = {
  id: "watch_test",
  label: "Deployment review",
  kind: "recurring",
  status: "running",
  phase: "duePending",
  wake: "agent",
  attempts: 3,
  deliveries: 2,
  missedTicks: 1,
  intervalMs: 30_000,
  startedAt: 1_800_000_000_000,
  nextDueAt: 1_800_000_030_000,
  expiresAt: 1_800_000_600_000,
};
const LIVE: BbWatchState = {
  state: "live",
  sessionId: "session_test",
  instanceId: "instance_test",
  watches: [WATCH],
};
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

async function panel(
  handler: (
    input: z.infer<typeof watchRpcContract.watches.input>
  ) => BbWatchState
) {
  const app = await loadPluginApp(() => import("./app.tsx"));
  const registration = app.threadPanelActions[0];
  if (registration === undefined) {
    throw new Error("Missing Until panel");
  }
  const view = renderSlot(
    registration,
    { threadId: "thr_test", params: null },
    {
      rpc: {
        watches: (input) =>
          handler(watchRpcContract.watches.input.parse(input)),
      },
    }
  );
  cleanups.push(() => view.lifecycle.unmount());
  return view;
}

describe("BB Until UI", () => {
  it("shows pending delivery and calls Complete directly with the expected process instance", async () => {
    const { phase, ...terminalWatch } = WATCH;
    expect(phase).toBe("duePending");
    const completed: BbWatchState = {
      ...LIVE,
      watches: [{ ...terminalWatch, status: "completed" }],
    };
    const view = await panel((input) =>
      input.request.action === "complete" ? completed : LIVE
    );
    expect(await view.findByText("Wake pending")).toBeTruthy();
    expect(view.getByText(/3 checks · 2 wakes · 1 missed/u)).toBeTruthy();
    await userEvent
      .setup()
      .click(view.getByRole("button", { name: "Complete" }));
    expect(await view.findByText("completed")).toBeTruthy();
    expect(view.inspection.rpcCalls).toContainEqual({
      method: "watches",
      input: {
        threadId: "thr_test",
        request: {
          action: "complete",
          id: "watch_test",
          instanceId: "instance_test",
        },
      },
    });
    expect(view.queryByRole("button", { name: "Complete" })).toBeNull();
  });

  it("does not offer Complete for a one-shot gate", async () => {
    const view = await panel(() => ({
      ...LIVE,
      watches: [{ ...WATCH, kind: "until", phase: "sleeping" }],
    }));
    await view.findByRole("button", { name: "Cancel" });
    expect(view.queryByRole("button", { name: "Complete" })).toBeNull();
  });

  it("hides cached live watches and controls after loss of the connection", async () => {
    let connected = true;
    const view = await panel(() =>
      connected ? LIVE : { state: "unavailable", reason: "Pi session stopped" }
    );
    await view.findByRole("button", { name: "Cancel" });
    connected = false;
    await userEvent
      .setup()
      .click(view.getByRole("button", { name: "Refresh" }));
    expect(await view.findByText("Pi session stopped")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(view.queryByText("Deployment review")).toBeNull();
  });

  it("the compact indicator opens the panel for its own thread", async () => {
    const app = await loadPluginApp(() => import("./app.tsx"));
    const registration = app.threadHeaderActions[0];
    if (registration === undefined) {
      throw new Error("Missing Until indicator");
    }
    const view = renderSlot(
      registration,
      {
        threadId: "thr_split",
        projectId: "proj_test",
        isCompactViewport: true,
      },
      { rpc: { watches: () => LIVE } }
    );
    cleanups.push(() => view.lifecycle.unmount());
    await userEvent.setup().click(
      await view.findByRole("button", {
        name: "Until: 1 active, 1 wake pending",
      })
    );
    expect(view.inspection.navigateCalls).toContainEqual(
      expect.objectContaining({
        method: "openThreadPanel",
        options: {
          actionId: "watches",
          title: "Until",
          params: { watchThreadId: "thr_split" },
        },
      })
    );
  });
});
