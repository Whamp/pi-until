import { cliCommand, defineCli } from "@get-bb/plugin-sdk";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import type {
  BbWatchRequest,
  BbWatchState,
} from "./bridge/bb-watch-protocol.ts";
import { bbThreadIdSchema, watchRpcContract } from "./watch-contract.ts";
import { formatBbWatchState } from "./watch-summary.ts";

function cliReply(state: BbWatchState, json?: boolean) {
  return {
    exitCode: state.state === "live" ? 0 : 1,
    stdout: json ? JSON.stringify(state) : formatBbWatchState(state),
  };
}

/** Route every read and control to the thread's current execution host. */
export default function untilPlugin(bb: BbPluginApi): void {
  const host = bb.hosts.experimental_client({ contract: watchRpcContract });
  async function requestWatches(
    threadId: string,
    request: BbWatchRequest
  ): Promise<BbWatchState> {
    const thread = await bb.sdk.threads.get({ threadId });
    if (thread.providerId !== "pi" || thread.environmentId === null) {
      return {
        state: "unavailable",
        reason: "This thread has no Pi execution session.",
      };
    }
    const environment = await bb.sdk.environments.get({
      environmentId: thread.environmentId,
    });
    try {
      return await host.call(
        "watches",
        { threadId, request },
        { hostId: environment.hostId, timeoutMs: 5_000 }
      );
    } catch (error) {
      if (request.action !== "list") {
        throw error;
      }
      return {
        state: "unavailable",
        reason: "The execution host or pi-until bridge is unavailable.",
      };
    }
  }
  bb.rpc.register(watchRpcContract, {
    watches: ({ threadId, request }) => requestWatches(threadId, request),
  });
  bb.agents.registerTool({
    name: "bb_until_status",
    description:
      "Read live pi-until watch state from a BB thread. Defaults to this thread. Does not create, restore, or control watches. Pi agents should use until for start/repeat/cancel/complete.",
    parameters: z.object({ threadId: bbThreadIdSchema.optional() }).strict(),
    execute: async ({ threadId }, context) =>
      JSON.stringify(
        await requestWatches(threadId ?? context.threadId, { action: "list" })
      ),
  });
  bb.agents.configure(() => ({
    tools: ["bb_until_status"],
    skills: ["until-bb"],
  }));

  const cliOptions = {
    thread: {
      type: "string",
      required: true,
      description: "Owning BB thread ID",
    },
    json: { type: "boolean", description: "Emit JSON state" },
  } as const;
  async function cliState(
    threadId: string,
    action: "list" | "cancel" | "complete",
    id?: string
  ) {
    const state = await requestWatches(bbThreadIdSchema.parse(threadId), {
      action: "list",
    });
    if (action === "list" || state.state === "unavailable") {
      return state;
    }
    if (id === undefined) {
      throw new Error("pi-until BB CLI requires a watch ID for controls");
    }
    return requestWatches(threadId, {
      action,
      id,
      instanceId: state.instanceId,
    });
  }
  function controlCommand(action: "cancel" | "complete") {
    return cliCommand({
      summary:
        action === "cancel"
          ? "Cancel without marking success"
          : "Complete a recurring watch",
      options: cliOptions,
      positionals: [{ name: "id", required: true, description: "Watch ID" }],
      async run(context) {
        const state = await cliState(
          context.options.thread,
          action,
          context.positionals.id
        );
        return cliReply(state, context.options.json);
      },
    });
  }
  bb.cli.register(
    defineCli({
      name: "until",
      summary: "Inspect and control live pi-until watches in BB",
      commands: {
        list: cliCommand({
          summary: "List live watches",
          options: cliOptions,
          async run(context) {
            const state = await cliState(context.options.thread, "list");
            return cliReply(state, context.options.json);
          },
        }),
        cancel: controlCommand("cancel"),
        complete: controlCommand("complete"),
      },
    })
  );
}
