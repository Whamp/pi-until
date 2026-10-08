import { defineRpcContract } from "@get-bb/plugin-sdk";
import { Value } from "typebox/value";
import { z } from "zod";

import {
  bbWatchRequestSchema,
  bbWatchStateSchema,
} from "./bridge/bb-watch-protocol.ts";
import type {
  BbWatchRequest,
  BbWatchState,
} from "./bridge/bb-watch-protocol.ts";

/** All clients validate thread identity before looking up an execution host. */
export const bbThreadIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^thr_[A-Za-z0-9_-]+$/u);

/** One contract crosses frontend, server, and host; Pi owns the inner wire schema. */
export const watchRpcContract = defineRpcContract({
  watches: {
    experimental_description:
      "Read live pi-until state, or cancel/complete a watch in the owning Pi process.",
    input: z
      .object({
        threadId: bbThreadIdSchema,
        request: z.custom<BbWatchRequest>((value) =>
          Value.Check(bbWatchRequestSchema, value)
        ),
      })
      .strict(),
    output: z.custom<BbWatchState>((value) =>
      Value.Check(bbWatchStateSchema, value)
    ),
  },
});
