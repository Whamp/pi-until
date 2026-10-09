// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.useRealTimers();
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

async function banner(
  handler: (
    input: z.infer<typeof watchRpcContract.watches.input>
  ) => BbWatchState,
  providerId = "pi"
) {
  const app = await loadPluginApp(() => import("./app.tsx"));
  const customization = app.composerCustomizations[0];
  const registration = customization?.banners?.[0];
  if (registration === undefined) {
    throw new Error("Missing Until composer banner");
  }
  expect(customization?.scopes).toEqual(["thread"]);
  expect(registration.chrome).toBe("bare");
  expect(app.threadHeaderActions).toHaveLength(0);
  const view = renderSlot(
    registration,
    {},
    {
      composer: {
        scope: { kind: "thread", threadId: "thr_split" },
        selection: { providerId },
        layout: "compact",
      },
      rpc: {
        watches: (input) =>
          handler(watchRpcContract.watches.input.parse(input)),
      },
    }
  );
  cleanups.push(() => view.lifecycle.unmount());
  return view;
}

async function pollWatchSnapshot() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
    // Query notifications use real timers; settle them before testing absence.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
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

  it("keeps readable counts in a compact composer and opens its own thread panel", async () => {
    const view = await banner(() => LIVE);
    const button = await view.findByRole("button", {
      name: "Until: 1 active, 1 wake pending. Open watch details.",
    });
    expect(button.textContent).toContain("Until · 1 active · 1 wake pending");
    await userEvent.setup().click(button);
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

  it("keeps ended-with-error watches visible even when none remain active", async () => {
    const { phase, ...finishedWatch } = WATCH;
    expect(phase).toBe("duePending");
    const view = await banner(() => ({
      ...LIVE,
      watches: [{ ...finishedWatch, status: "expired" }],
    }));
    const button = await view.findByRole("button", {
      name: "Until: 0 active, 1 needs attention. Open watch details.",
    });
    expect(button.textContent).toContain(
      "Until · 0 active · 1 needs attention"
    );
  });

  it.each(["succeeded", "completed", "cancelled"] as const)(
    "keeps the row hidden after the final watch is %s and its session closes",
    async (status) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      let state: BbWatchState = LIVE;
      const { phase, ...finishedWatch } = WATCH;
      expect(phase).toBe("duePending");
      const view = await banner(() => state);
      await view.findByRole("button", { name: /Until: 1 active/u });
      state = {
        ...LIVE,
        watches: [
          {
            ...finishedWatch,
            kind: status === "succeeded" ? "until" : "recurring",
            status,
          },
        ],
      };
      await pollWatchSnapshot();
      expect(view.queryByRole("button")).toBeNull();
      state = { state: "unavailable", reason: "Pi session stopped" };
      await pollWatchSnapshot();
      expect(view.queryByRole("button")).toBeNull();
      state = {
        ...LIVE,
        instanceId: "instance_next",
        sessionId: "session_next",
      };
      await pollWatchSnapshot();
      await view.findByRole("button", { name: /Until: 1 active/u });
    }
  );

  it.each(["unavailable", "rpc-error"])(
    "does not add an unused connection-status row: %s",
    async (failure) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const view = await banner(() => {
        if (failure === "rpc-error") {
          throw new Error("Pi bridge disconnected");
        }
        return { state: "unavailable", reason: "No Pi session" };
      });
      await pollWatchSnapshot();
      expect(view.inspection.rpcCalls.length).toBeGreaterThan(1);
      expect(view.queryByRole("button")).toBeNull();
    }
  );

  it.each(["unavailable", "rpc-error"])(
    "removes the row and stale counts after connection loss: %s",
    async (failure) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      let connected = true;
      const view = await banner(() => {
        if (connected) {
          return LIVE;
        }
        if (failure === "rpc-error") {
          throw new Error("Pi bridge disconnected");
        }
        return { state: "unavailable", reason: "Pi session stopped" };
      });
      await view.findByRole("button", { name: /Until: 1 active/u });
      connected = false;
      await pollWatchSnapshot();
      expect(view.queryByRole("button")).toBeNull();
      expect(view.queryByText(/1 active/u)).toBeNull();
      expect(view.queryByText(/wake pending/u)).toBeNull();
    }
  );

  it("does not read Pi watches in a non-Pi composer", async () => {
    const view = await banner(() => LIVE, "codex");
    expect(view.queryByRole("button")).toBeNull();
    expect(view.inspection.rpcCalls).toHaveLength(0);
  });

  it("resets to the new owning thread when the composer scope changes", async () => {
    const view = await banner(() => LIVE);
    await view.findByRole("button", { name: /Until: 1 active/u });
    await view.behavior.setComposerScope({
      kind: "thread",
      threadId: "thr_right",
    });
    await userEvent
      .setup()
      .click(await view.findByRole("button", { name: /Until: 1 active/u }));
    expect(view.inspection.rpcCalls).toContainEqual({
      method: "watches",
      input: { threadId: "thr_right", request: { action: "list" } },
    });
    expect(view.inspection.navigateCalls).toContainEqual(
      expect.objectContaining({
        method: "openThreadPanel",
        options: {
          actionId: "watches",
          title: "Until",
          params: { watchThreadId: "thr_right" },
        },
      })
    );
    await view.behavior.setComposerScope({
      kind: "new-thread",
      projectId: null,
    });
    expect(view.queryByRole("button")).toBeNull();
  });
});
