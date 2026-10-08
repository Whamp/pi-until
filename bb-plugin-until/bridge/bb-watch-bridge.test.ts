import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Value } from "typebox/value";
import { expect, it } from "vitest";

import { createBbWatchBridge } from "./bb-watch-bridge.ts";
import { requestBbWatchState } from "./bb-watch-client.ts";
import { bbWatchSocketPath, bbWatchThreadKey } from "./bb-watch-paths.ts";
import type { BbWatchView } from "./bb-watch-protocol.ts";
import { bbWatchEndpointSchema } from "./bb-watch-protocol.ts";

it("rejects a shell capability at the socket boundary without echoing its input or calling the owner", async () => {
  const directory = mkdtempSync(join(tmpdir(), "until-wire-"));
  let called = false;
  const bridge = await createBbWatchBridge(
    { directory, threadId: "thr_wire_test" },
    {
      snapshot: () => {
        called = true;
        return { sessionId: "session", watches: [] };
      },
      control: () => {
        called = true;
      },
    }
  );
  try {
    const discovery: unknown = JSON.parse(
      readFileSync(
        join(directory, `${bbWatchThreadKey("thr_wire_test")}.json`),
        "utf-8"
      )
    );
    if (!Value.Check(bbWatchEndpointSchema, discovery)) {
      throw new Error("Invalid bridge discovery fixture");
    }
    await Promise.all(
      [
        JSON.stringify({ action: "start", condition: "SECRET_FROM_PAYLOAD" }),
        "SECRET_FROM_PAYLOAD",
      ].map(async (payload) => {
        const socket = connect(
          bbWatchSocketPath(directory, "thr_wire_test", discovery.instanceId)
        );
        socket.write(`${payload}\n`);
        let reply = "";
        for await (const chunk of socket) {
          if (!Buffer.isBuffer(chunk)) {
            throw new TypeError("Expected socket bytes");
          }
          reply += chunk.toString("utf-8");
        }
        expect(reply).toContain("error");
        expect(reply).not.toContain("SECRET_FROM_PAYLOAD");
        expect(called).toBe(false);
      })
    );
  } finally {
    await bridge.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("reads a full bounded snapshot with multibyte labels without marking it offline", async () => {
  const directory = mkdtempSync(join(tmpdir(), "until-dense-"));
  const watches = Array.from(
    { length: 82 },
    (...[, index]) =>
      ({
        id: `watch_${index}`,
        label: "界".repeat(200),
        kind: "recurring",
        status: index < 32 ? "running" : "completed",
        phase: index < 32 ? "sleeping" : undefined,
        finishedAt: index < 32 ? undefined : 1_800_000_040_000,
        wake: "agent",
        attempts: 1,
        deliveries: 0,
        missedTicks: 0,
        intervalMs: 30_000,
        startedAt: 1_800_000_000_000,
        nextDueAt: 1_800_000_030_000,
        expiresAt: 1_800_000_600_000,
        lastExitCode: 1,
      }) satisfies BbWatchView
  );
  const bridge = await createBbWatchBridge(
    { directory, threadId: "thr_dense_test" },
    {
      snapshot: () => ({ sessionId: "session", watches }),
      control: () => {
        throw new Error("Unexpected control");
      },
    }
  );
  try {
    const state = await requestBbWatchState(
      { directory, threadId: "thr_dense_test" },
      { action: "list" }
    );
    expect(state.state).toBe("live");
    if (state.state !== "live") {
      throw new Error("Expected full live snapshot");
    }
    expect(state.watches).toHaveLength(82);
    expect(state.watches[81]?.label).toBe("界".repeat(200));
  } finally {
    await bridge.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
