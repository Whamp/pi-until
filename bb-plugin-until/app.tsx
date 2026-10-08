import {
  definePluginApp,
  useBbNavigate,
  useComposer,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { z } from "zod";

import type {
  BbWatchRequest,
  BbWatchState,
  BbWatchView,
} from "./bridge/bb-watch-protocol.ts";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { bbThreadIdSchema } from "./watch-contract.ts";
import type { watchRpcContract } from "./watch-contract.ts";
import { summarizeBbWatches, watchPhaseLabel } from "./watch-summary.ts";
import { Text, Title } from "./watch-typography.tsx";

function WatchQueryScope({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function useWatchState(threadId: string) {
  const rpc = useRpc<typeof watchRpcContract>();
  return useQuery({
    queryKey: ["pi-until-watches", threadId],
    queryFn: () =>
      rpc.call("watches", { threadId, request: { action: "list" } }),
    refetchInterval: 2_000,
    retry: false,
    gcTime: 0,
  });
}

function WatchComposerBanner({ threadId }: { threadId: string }) {
  const navigate = useBbNavigate();
  const query = useWatchState(threadId);
  const state = query.isError ? undefined : query.data;
  const counts =
    state?.state === "live" ? summarizeBbWatches(state.watches) : undefined;
  const label =
    counts === undefined
      ? "Until unavailable"
      : `Until: ${counts.active} active${counts.pending > 0 ? `, ${counts.pending} wake pending` : ""}${counts.failed > 0 ? `, ${counts.failed} needs attention` : ""}`;
  if (
    query.isPending ||
    (counts !== undefined && counts.active === 0 && counts.failed === 0)
  ) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto min-h-11 w-full justify-start whitespace-normal rounded-lg px-3 py-2 text-left font-normal text-muted-foreground"
      aria-label={`${label}. Open watch details.`}
      onClick={() => {
        navigate.openThreadPanel({
          actionId: "watches",
          title: "Until",
          params: { watchThreadId: threadId },
        });
      }}
    >
      <Icon name="Timer" className="size-4 shrink-0" />
      <Text
        as="span"
        className="min-w-0 flex-1 break-words"
        aria-live="polite"
        aria-atomic="true"
      >
        {counts === undefined ? (
          "Until · unavailable"
        ) : (
          <>
            Until{" · "}
            <Text as="span" className="whitespace-nowrap">
              {counts.active} active
            </Text>
            {counts.pending > 0 ? (
              <>
                {" "}
                <Text as="span" className="whitespace-nowrap">
                  · {counts.pending} wake pending
                </Text>
              </>
            ) : null}
            {counts.failed > 0 ? (
              <>
                {" "}
                <Text as="span" className="whitespace-nowrap text-destructive">
                  · {counts.failed} needs attention
                </Text>
              </>
            ) : null}
          </>
        )}
      </Text>
      <Icon name="ChevronRight" className="size-4 shrink-0" />
    </Button>
  );
}

function timestampLabel(value: number | undefined): string {
  return value === undefined || value === 0
    ? "—"
    : new Date(value).toLocaleString();
}

function WatchCard({
  watch,
  busy,
  onControl,
}: {
  watch: BbWatchView;
  busy: boolean;
  onControl: (action: "cancel" | "complete", id: string) => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <Title className="text-sm font-medium break-words">{watch.label}</Title>
        <Text className="shrink-0 text-xs text-muted-foreground">
          {watchPhaseLabel(watch)}
        </Text>
      </div>
      <Text className="font-mono text-xs text-muted-foreground break-all">
        {watch.id}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {watch.kind === "recurring" ? "Recurring" : "Shell gate"} ·{" "}
        {watch.attempts} checks · {watch.deliveries} wakes · {watch.missedTicks}{" "}
        missed · wakes {watch.wake}
      </Text>
      <Text className="text-xs text-muted-foreground">
        Started: {timestampLabel(watch.startedAt)}
      </Text>
      {watch.status === "running" ? (
        <Text className="text-xs text-muted-foreground">
          Next due: {timestampLabel(watch.nextDueAt)} · interval{" "}
          {watch.intervalMs / 1_000}s
        </Text>
      ) : null}
      {watch.expiresAt === undefined ? null : (
        <Text className="text-xs text-muted-foreground">
          Deadline: {timestampLabel(watch.expiresAt)}
        </Text>
      )}
      {watch.finishedAt === undefined ? null : (
        <Text className="text-xs text-muted-foreground">
          Finished: {timestampLabel(watch.finishedAt)}
        </Text>
      )}
      {watch.lastExitCode === undefined ? null : (
        <Text className="text-xs text-muted-foreground">
          Last exit code: {watch.lastExitCode}
        </Text>
      )}
      {watch.status === "running" ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onControl("cancel", watch.id)}
          >
            Cancel
          </Button>
          {watch.kind === "recurring" ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onControl("complete", watch.id)}
            >
              Complete
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function WatchPanel({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof watchRpcContract>();
  const client = useQueryClient();
  const query = useWatchState(threadId);
  const mutation = useMutation({
    mutationFn: async (request: BbWatchRequest) => {
      await client.cancelQueries({ queryKey: ["pi-until-watches", threadId] });
      return rpc.call("watches", { threadId, request });
    },
    onSuccess: (state: BbWatchState) => {
      client.setQueryData(["pi-until-watches", threadId], state);
    },
  });
  const state = query.isError ? undefined : query.data;
  const live = state?.state === "live" ? state : undefined;
  const onControl = (action: "cancel" | "complete", id: string) => {
    if (live !== undefined) {
      mutation.mutate({ action, id, instanceId: live.instanceId });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Title className="font-medium">Session watches</Title>
        <Button
          size="sm"
          variant="ghost"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          Refresh
        </Button>
      </div>
      <Text className="font-mono text-xs text-muted-foreground break-all">
        Thread: {threadId}
      </Text>
      <Text className="text-xs text-muted-foreground">
        Live snapshots update every 2 seconds while this view is visible. Pi
        owns all checks and wakes.
      </Text>
      {mutation.isError ? (
        <Text role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </Text>
      ) : null}
      <WatchStateBody
        pending={query.isPending}
        state={state}
        busy={mutation.isPending}
        onControl={onControl}
      />
      <Text className="text-xs text-muted-foreground">
        Complete marks a recurring goal achieved. Cancel stops it without
        success. A successful gate permits work; it does not complete recurring
        work.
      </Text>
    </div>
  );
}

function WatchStateBody({
  pending,
  state,
  busy,
  onControl,
}: {
  pending: boolean;
  state: BbWatchState | undefined;
  busy: boolean;
  onControl: (action: "cancel" | "complete", id: string) => void;
}) {
  if (pending) {
    return <Text role="status">Connecting to Pi…</Text>;
  }
  if (state?.state !== "live") {
    return (
      <Text role="status" className="text-sm text-muted-foreground">
        {state?.reason ??
          "The BB connection is unavailable. Cached watches are not shown as live."}
      </Text>
    );
  }
  return (
    <>
      <Text className="text-xs text-muted-foreground">
        Session: {state.sessionId}
      </Text>
      {state.watches.length === 0 ? (
        <Text role="status" className="text-sm text-muted-foreground">
          No watches in this live Pi session. Ask the agent to start one with
          until.
        </Text>
      ) : (
        <ul className="space-y-3">
          {state.watches.map((watch) => (
            <WatchCard
              key={watch.id}
              watch={watch}
              busy={busy}
              onControl={onControl}
            />
          ))}
        </ul>
      )}
    </>
  );
}

const panelTargetSchema = z.object({ watchThreadId: bbThreadIdSchema });
function WatchPanelSlot({ threadId, params }: PluginThreadPanelProps) {
  const target = panelTargetSchema.safeParse(params);
  const watchThreadId = target.success ? target.data.watchThreadId : threadId;
  return (
    <WatchQueryScope key={watchThreadId}>
      <WatchPanel threadId={watchThreadId} />
    </WatchQueryScope>
  );
}

function WatchComposerBannerSlot() {
  const composer = useComposer();
  if (
    composer.scope.kind !== "thread" ||
    composer.selection?.providerId !== "pi"
  ) {
    return null;
  }
  return (
    <WatchQueryScope key={composer.scope.threadId}>
      <WatchComposerBanner threadId={composer.scope.threadId} />
    </WatchQueryScope>
  );
}

/** BB places the status row above the composer and owns panel navigation. */
export default definePluginApp((app) => {
  app.composer.customize({
    id: "until-watches",
    scopes: ["thread"],
    banners: [
      {
        id: "watch-status",
        chrome: "bare",
        component: WatchComposerBannerSlot,
      },
    ],
  });
  app.slots.threadPanelAction({
    id: "watches",
    title: "Until",
    icon: "Timer",
    component: WatchPanelSlot,
  });
});
