import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestBbWatchState } from "../bb-plugin-until/bridge/bb-watch-client.ts";
import { FakeSession, loadExtension, receiptOf } from "./fake-pi.ts";
import type { FakeExtension } from "./fake-pi.ts";

const THREAD_ID = "thr_bridge_test";
let directory: string;
let extension: FakeExtension;
let session: FakeSession;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "until-bb-"));
  session = new FakeSession();
  extension = loadExtension(session, {
    bbBridge: { directory, threadId: THREAD_ID },
  });
});
afterEach(async () => {
  await extension.shutdown("quit");
  rmSync(directory, { recursive: true, force: true });
});

async function state() {
  return requestBbWatchState(
    { threadId: THREAD_ID, directory },
    { action: "list" }
  );
}

async function start(params: Parameters<FakeExtension["tool"]>[1]) {
  return receiptOf(
    await extension.tool(
      "bridge-call",
      params,
      new AbortController().signal,
      undefined,
      session.context({ mode: "rpc" }).ctx
    )
  );
}

describe("BB watch bridge", () => {
  it("serves live safe state in RPC mode, and cancellation never wakes the agent", async () => {
    const ctx = session.context({ mode: "rpc" }).ctx;
    await extension.sessionStart("startup", ctx);
    const receipt = await start({
      action: "start",
      condition: "false",
      label: "Deployment gate",
      timeoutSeconds: 60,
    });
    const live = await state();
    expect(live.state).toBe("live");
    if (live.state !== "live") {
      throw new Error("expected a live bridge");
    }
    expect(live.sessionId).toBe(session.id);
    expect(live.watches).toEqual([
      expect.objectContaining({
        id: receipt.id,
        label: "Deployment gate",
        status: "running",
        kind: "until",
      }),
    ]);
    expect(JSON.stringify(live)).not.toContain("condition");
    expect(JSON.stringify(live)).not.toContain("quickRef");
    await requestBbWatchState(
      { threadId: THREAD_ID, directory },
      { action: "cancel", id: receipt.id, instanceId: live.instanceId }
    );
    await expect
      .poll(async () => {
        const result = await state();
        return result.state === "live"
          ? result.watches[0]?.status
          : result.state;
      })
      .toBe("cancelled");
    expect(extension.messages).toHaveLength(0);
    expect(extension.telemetry).toContainEqual(
      expect.objectContaining({ source: "bb", action: "cancel" })
    );
  });

  it("completes recurring work, rejects completion of a gate, and rejects stale-instance controls", async () => {
    await extension.sessionStart(
      "startup",
      session.context({ mode: "rpc" }).ctx
    );
    const recurring = await start({
      action: "repeat",
      instruction: "Private recurring instruction",
      quickRef: "Private reference",
      intervalSeconds: 60,
      timeoutSeconds: 600,
      label: "Review",
    });
    const gate = await start({
      action: "start",
      condition: "false",
      label: "Gate",
    });
    const live = await state();
    if (live.state !== "live") {
      throw new Error("expected a live bridge");
    }
    expect(JSON.stringify(live)).not.toContain("Private");
    await expect(
      requestBbWatchState(
        { threadId: THREAD_ID, directory },
        { action: "complete", id: gate.id, instanceId: live.instanceId }
      )
    ).rejects.toThrow("Only recurring");
    await expect(
      requestBbWatchState(
        { threadId: THREAD_ID, directory },
        { action: "cancel", id: recurring.id, instanceId: "old-instance" }
      )
    ).rejects.toThrow("session changed");
    const completed = await requestBbWatchState(
      { threadId: THREAD_ID, directory },
      { action: "complete", id: recurring.id, instanceId: live.instanceId }
    );
    if (completed.state !== "live") {
      throw new Error("expected a live bridge");
    }
    expect(
      completed.watches.find((watch) => watch.id === recurring.id)?.status
    ).toBe("completed");
    expect(extension.messages).toHaveLength(0);
  });

  it("uses private discovery and removes the connection on shutdown", async () => {
    await extension.sessionStart(
      "startup",
      session.context({ mode: "rpc" }).ctx
    );
    const paths = readdirSync(directory);
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(statSync(join(directory, path)).mode % 0o100).toBe(0);
    }
    const discovery = paths.find((path) => path.endsWith(".json"));
    if (discovery === undefined) {
      throw new Error("expected discovery file");
    }
    expect(readFileSync(join(directory, discovery), "utf-8")).not.toContain(
      "watches"
    );
    await extension.shutdown("new");
    const stopped = await state();
    expect(stopped.state).toBe("unavailable");
    expect(readdirSync(directory)).toEqual([discovery]);
  });

  it("keeps native labels intact while bounding the BB display label", async () => {
    await extension.sessionStart(
      "startup",
      session.context({ mode: "rpc" }).ctx
    );
    const label = "Safe label ".repeat(100);
    const receipt = await start({ action: "start", condition: "false", label });
    const live = await state();
    expect(live.state).toBe("live");
    if (live.state !== "live") {
      throw new Error("Expected live bridge for long label");
    }
    expect(receipt.label).toBe(label.trim());
    expect(live.watches[0]?.label).toHaveLength(200);
  });

  it("honors PI_UNTIL_BB_BRIDGE=0 without starting a socket", async () => {
    vi.stubEnv("PI_UNTIL_BB_BRIDGE", "0");
    try {
      await extension.sessionStart(
        "startup",
        session.context({ mode: "rpc" }).ctx
      );
      const disabled = await state();
      expect(disabled.state).toBe("unavailable");
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not start the bridge in a terminal session", async () => {
    await extension.sessionStart("startup", session.context().ctx);
    const terminal = await state();
    expect(terminal.state).toBe("unavailable");
    expect(readdirSync(directory)).toEqual([]);
  });

  it("an old process cannot remove a replacement process's discovery", async () => {
    await extension.sessionStart(
      "startup",
      session.context({ mode: "rpc" }).ctx
    );
    const old = await state();
    const replacement = loadExtension(new FakeSession(), {
      bbBridge: { directory, threadId: THREAD_ID },
    });
    try {
      await replacement.sessionStart(
        "startup",
        session.context({ mode: "rpc" }).ctx
      );
      const next = await state();
      expect(next.state).toBe("live");
      if (next.state !== "live" || old.state !== "live") {
        throw new Error("expected live bridges");
      }
      expect(next.instanceId).not.toBe(old.instanceId);
      await extension.shutdown("quit");
      const remaining = await state();
      expect(remaining.state).toBe("live");
    } finally {
      await replacement.shutdown("quit");
    }
  });
});
