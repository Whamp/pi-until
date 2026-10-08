import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";

import { requestBbWatchState } from "./bridge/bb-watch-client.ts";
import { watchRpcContract } from "./watch-contract.ts";

/** Runs on the thread's execution host, never in the remote browser or BB server. */
export default experimental_defineHostEntry({
  contract: watchRpcContract,
  handlers: {
    watches: ({ threadId, request }, context) =>
      requestBbWatchState({ threadId, signal: context.signal }, request),
  },
});
