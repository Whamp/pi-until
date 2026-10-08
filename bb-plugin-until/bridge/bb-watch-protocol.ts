import { Type } from "typebox";
import type { Static } from "typebox";

/** Maximum BB label length in characters; Pi retains the original label. */
export const BB_WATCH_LABEL_LIMIT = 200;

const boundedId = Type.String({ minLength: 1, maxLength: 128 });
const count = Type.Integer({ minimum: 0 });
const timestamp = Type.Number({ minimum: 0 });

/** Safe watch display fields; never contains commands, output, or task packets. */
export const bbWatchViewSchema = Type.Object(
  {
    id: boundedId,
    label: Type.String({ maxLength: BB_WATCH_LABEL_LIMIT }),
    kind: Type.Union([Type.Literal("until"), Type.Literal("recurring")]),
    status: Type.Union([
      Type.Literal("running"),
      Type.Literal("succeeded"),
      Type.Literal("timedOut"),
      Type.Literal("completed"),
      Type.Literal("expired"),
      Type.Literal("cancelled"),
      Type.Literal("failed"),
    ]),
    phase: Type.Optional(
      Type.Union([
        Type.Literal("checking"),
        Type.Literal("sleeping"),
        Type.Literal("duePending"),
        Type.Literal("awaitingSettlement"),
      ])
    ),
    wake: Type.Union([Type.Literal("agent"), Type.Literal("notify")]),
    attempts: count,
    deliveries: count,
    missedTicks: count,
    intervalMs: Type.Number({ minimum: 1 }),
    startedAt: timestamp,
    nextDueAt: timestamp,
    expiresAt: Type.Optional(timestamp),
    finishedAt: Type.Optional(timestamp),
    lastExitCode: Type.Optional(Type.Number()),
  },
  { additionalProperties: false }
);

/** A snapshot is live only when the owning Pi process answers this request. */
export const bbWatchStateSchema = Type.Union([
  Type.Object(
    {
      state: Type.Literal("live"),
      instanceId: boundedId,
      sessionId: boundedId,
      watches: Type.Array(bbWatchViewSchema, { maxItems: 82 }),
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      state: Type.Literal("unavailable"),
      reason: Type.String({ maxLength: 512 }),
    },
    { additionalProperties: false }
  ),
]);

/** Mutations name the process instance to reject controls from a stale panel. */
export const bbWatchRequestSchema = Type.Union([
  Type.Object(
    { action: Type.Literal("list") },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      action: Type.Union([Type.Literal("cancel"), Type.Literal("complete")]),
      id: boundedId,
      instanceId: boundedId,
    },
    { additionalProperties: false }
  ),
]);

/** Discovery holds only a socket instance, not watch state or recovery authority. */
export const bbWatchEndpointSchema = Type.Object(
  {
    version: Type.Literal(1),
    instanceId: Type.String({ pattern: "^[a-f0-9]{16}$" }),
  },
  { additionalProperties: false }
);

/** JSON transport errors must not be mistaken for watch results. */
export const bbWatchReplySchema = Type.Union([
  bbWatchStateSchema,
  Type.Object(
    { error: Type.String({ maxLength: 512 }) },
    { additionalProperties: false }
  ),
]);

/** Parsed watch data at the BB boundary. */
export type BbWatchView = Static<typeof bbWatchViewSchema>;
/** Parsed live or unavailable state at the BB boundary. */
export type BbWatchState = Static<typeof bbWatchStateSchema>;
/** Parsed read or control request at the BB boundary. */
export type BbWatchRequest = Static<typeof bbWatchRequestSchema>;
