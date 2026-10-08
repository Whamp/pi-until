import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import untilPlugin from "./server.ts";

const LIVE_EMPTY = {
  state: "live",
  sessionId: "session_test",
  instanceId: "instance_test",
  watches: [],
} as const;

describe("BB Until server", () => {
  it("routes to the execution host, not the BB server, and exposes read-only agent state", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "until",
      experimental_hostEntry: true,
      agentSkillIds: ["until-bb"],
      sdk: {
        threads: {
          get: async () =>
            makeThreadResponse({
              id: "thr_test",
              providerId: "pi",
              environmentId: "env_test",
            }),
        },
        environments: { get: async () => ({ hostId: "host_execution" }) },
      },
      experimental_callHostRpc: async () => LIVE_EMPTY,
    });
    try {
      untilPlugin(bb);
      expect(
        await harness.behavior.callRpc("watches", {
          threadId: "thr_test",
          request: { action: "list" },
        })
      ).toEqual(LIVE_EMPTY);
      expect(harness.experimental_hostRpcCalls).toEqual([
        expect.objectContaining({
          hostId: "host_execution",
          method: "watches",
          input: { threadId: "thr_test", request: { action: "list" } },
        }),
      ]);
      const result = await harness.behavior.callAgentTool("bb_until_status", {
        threadId: "thr_test",
      });
      expect(result).toContain('"state":"live"');
      expect(
        await harness.behavior.runCli([
          "list",
          "--thread",
          "thr_test",
          "--json",
        ])
      ).toMatchObject({ exitCode: 0, stdout: JSON.stringify(LIVE_EMPTY) });
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("rejects malformed controls before host access", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "until",
      experimental_hostEntry: true,
    });
    try {
      untilPlugin(bb);
      await expect(
        harness.behavior.callRpc("watches", {
          threadId: "../secret",
          request: { action: "list" },
        })
      ).rejects.toThrow();
      await expect(
        harness.behavior.callRpc("watches", {
          threadId: "thr_test",
          request: { action: "cancel", id: "watch" },
        })
      ).rejects.toThrow();
      expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("marks an offline host unavailable and never turns a failed control into success", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "until",
      experimental_hostEntry: true,
      sdk: {
        threads: {
          get: async () =>
            makeThreadResponse({
              id: "thr_test",
              providerId: "pi",
              environmentId: "env_test",
            }),
        },
        environments: { get: async () => ({ hostId: "host_execution" }) },
      },
      experimental_callHostRpc: async () => {
        throw new Error("Host offline");
      },
    });
    try {
      untilPlugin(bb);
      expect(
        await harness.behavior.callRpc("watches", {
          threadId: "thr_test",
          request: { action: "list" },
        })
      ).toMatchObject({ state: "unavailable" });
      await expect(
        harness.behavior.callRpc("watches", {
          threadId: "thr_test",
          request: { action: "cancel", id: "watch", instanceId: "instance" },
        })
      ).rejects.toThrow("Host offline");
      expect(harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
