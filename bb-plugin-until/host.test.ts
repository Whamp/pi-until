import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { expect, it, vi } from "vitest";

import { createBbWatchBridge } from "./bridge/bb-watch-bridge.ts";
import { bbWatchDirectory } from "./bridge/bb-watch-paths.ts";
import hostEntry from "./host.ts";

it("the host entry crosses a real private socket using the validated wire contract", async () => {
  const home = mkdtempSync(join(tmpdir(), "until-host-"));
  vi.stubEnv("HOME", home);
  const bridge = await createBbWatchBridge(
    { threadId: "thr_host_test", directory: bbWatchDirectory() },
    {
      snapshot: () => ({ sessionId: "session_host", watches: [] }),
      control: () => {
        throw new Error("No watches in test session");
      },
    }
  );
  const harness = experimental_createHostEntryHarness(hostEntry);
  try {
    const result = await harness.experimental_call("watches", {
      threadId: "thr_host_test",
      request: { action: "list" },
    });
    expect(result).toMatchObject({
      state: "live",
      sessionId: "session_host",
      watches: [],
    });
    await expect(
      harness.experimental_call("watches", {
        threadId: "../outside",
        request: { action: "list" },
      })
    ).rejects.toThrow();
  } finally {
    await harness.experimental_dispose();
    await bridge.close();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  }
});
