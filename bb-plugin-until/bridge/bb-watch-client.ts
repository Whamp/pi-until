import { lstatSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";

import { Value } from "typebox/value";

import {
  bbWatchDirectory,
  bbWatchSocketPath,
  bbWatchThreadKey,
} from "./bb-watch-paths.ts";
import {
  bbWatchEndpointSchema,
  bbWatchReplySchema,
} from "./bb-watch-protocol.ts";
import type { BbWatchRequest, BbWatchState } from "./bb-watch-protocol.ts";

interface BbWatchClientOptions {
  readonly threadId: string;
  readonly directory?: string;
  readonly signal?: AbortSignal;
}

function privateEndpointFile(path: string): string {
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 4_096 ||
    info.uid !== process.getuid?.() ||
    info.mode % 0o100 !== 0
  ) {
    throw new Error("pi-until BB bridge discovery file is not private");
  }
  return readFileSync(path, "utf-8");
}

function exchangeBbWatchRequest(
  socketPath: string,
  request: BbWatchRequest,
  signal?: AbortSignal
): Promise<BbWatchState> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    const abort = () => {
      socket.destroy(new Error("pi-until BB bridge request cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    socket.on("close", () => {
      signal?.removeEventListener("abort", abort);
    });
    socket.on("error", reject);
    socket.setTimeout(2_000, () => {
      socket.destroy(new Error("pi-until BB bridge request timed out"));
    });
    socket.setEncoding("utf-8");
    socket.once("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on("data", (chunk: string) => {
      response += chunk;
      if (Buffer.byteLength(response) > 131_072) {
        socket.destroy(
          new Error("pi-until BB bridge response exceeded its size limit")
        );
      }
    });
    socket.once("end", () => {
      try {
        const decoded: unknown = JSON.parse(response);
        if (!Value.Check(bbWatchReplySchema, decoded)) {
          throw new Error("pi-until BB bridge response is invalid");
        }
        if ("error" in decoded) {
          throw new Error(decoded.error);
        }
        resolve(decoded);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("pi-until BB bridge response parsing failed")
        );
      }
    });
    if (signal?.aborted) {
      abort();
    }
  });
}

/** Query the owning process, not cached receipts; failed reads are explicitly unavailable. */
export async function requestBbWatchState(
  options: BbWatchClientOptions,
  request: BbWatchRequest
): Promise<BbWatchState> {
  try {
    const directory = options.directory ?? bbWatchDirectory();
    const endpointPath = join(
      directory,
      `${bbWatchThreadKey(options.threadId)}.json`
    );
    const endpoint: unknown = JSON.parse(privateEndpointFile(endpointPath));
    if (!Value.Check(bbWatchEndpointSchema, endpoint)) {
      throw new Error("pi-until BB bridge discovery is invalid");
    }
    return await exchangeBbWatchRequest(
      bbWatchSocketPath(directory, options.threadId, endpoint.instanceId),
      request,
      options.signal
    );
  } catch (error) {
    if (request.action !== "list") {
      throw error;
    }
    return {
      state: "unavailable",
      reason:
        "No live pi-until connection. Load the updated extension on this host and start or reload the Pi session.",
    };
  }
}
