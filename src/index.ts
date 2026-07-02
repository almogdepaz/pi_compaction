import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { EXTENSION_NAME, InvalidationReason } from "./constants";
import { startAsyncJob } from "./job";
import type { StartAsyncJobOutcome } from "./job";
import { createRuntimeState, formatRuntimeStatus, markStale } from "./runtime-state";
import { formatStartWindow, getAsyncCompactionMarker, getCompactionSettings, getStartRatio, getStartWindow, getTimeoutMs, isEnabled } from "./utils";
import { validateReadyJob } from "./validation";

interface AsyncPrefixCompactionDependencies {
	readonly startAsyncJob: typeof startAsyncJob;
}

const defaultDependencies: AsyncPrefixCompactionDependencies = {
	startAsyncJob,
};

export default function asyncPrefixCompaction(pi: ExtensionAPI, deps: AsyncPrefixCompactionDependencies = defaultDependencies) {
	const state = createRuntimeState();

	function clearCliStatus(ctx: ExtensionContext): void {
		if (ctx.hasUI) ctx.ui.setStatus(EXTENSION_NAME, undefined);
	}

	function formatManualStartOutcome(outcome: StartAsyncJobOutcome): string | undefined {
		if (outcome === "started" || outcome === "ready_reused") return undefined;
		const reasonByOutcome: Record<Exclude<StartAsyncJobOutcome, "started" | "ready_reused">, string> = {
			already_pending: "job already pending",
			disabled: "disabled",
			model_missing: "model unavailable",
			settings_disabled: "Pi compaction disabled",
			context_unknown: "context usage unknown",
			start_window_empty: "start window empty",
			below_threshold: "below threshold",
			above_force_threshold: "past compaction threshold",
			nothing_to_compact: "nothing to compact",
		};
		return `async compaction not started: ${reasonByOutcome[outcome]}`;
	}

	function showStatus(ctx: ExtensionCommandContext): void {
		const startRatio = getStartRatio();
		const settings = ctx.model ? getCompactionSettings(ctx) : undefined;
		const startWindow = settings ? formatStartWindow(getStartWindow(ctx.model?.contextWindow, startRatio, settings.reserveTokens)) : "unknown";
		const statusText = formatRuntimeStatus(state, {
			enabled: isEnabled(),
			startRatio,
			startWindow,
			timeoutMs: getTimeoutMs(),
		});
		if (ctx.hasUI) {
			ctx.ui.notify(statusText, "info");
		} else {
			console.log(statusText);
		}
	}

	pi.on("turn_end", (_event, ctx) => {
		deps.startAsyncJob(ctx, state);
	});

	pi.on("model_select", (_event, ctx) => {
		if (state.status === "pending" || state.status === "ready") {
			markStale(state, InvalidationReason.MODEL_CHANGED);
			clearCliStatus(ctx);
		}
	});

	pi.on("thinking_level_select", (_event, ctx) => {
		if (state.status === "pending" || state.status === "ready") {
			markStale(state, InvalidationReason.THINKING_CHANGED);
			clearCliStatus(ctx);
		}
	});

	pi.on("session_tree", (_event, ctx) => {
		if (state.status === "pending" || state.status === "ready") {
			markStale(state, InvalidationReason.SNAPSHOT_LEAF_MISSING);
			clearCliStatus(ctx);
		}
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const ready = state.ready;
		if (!ready || state.status !== "ready") {
			if (state.status === "pending") {
				markStale(state, InvalidationReason.SYNC_FALLBACK);
				clearCliStatus(ctx);
			}
			return;
		}

		const invalidReason = validateReadyJob(ready, event, ctx);
		if (invalidReason) {
			markStale(state, invalidReason);
			clearCliStatus(ctx);
			return;
		}

		state.status = "idle";
		state.ready = undefined;
		state.reason = undefined;
		state.lastHandedOffJobId = ready.jobId;
		clearCliStatus(ctx);
		return { compaction: ready.result };
	});

	pi.on("session_compact", (event, ctx) => {
		const marker = event.fromExtension ? getAsyncCompactionMarker(event.compactionEntry.details) : undefined;
		if (!marker) return;

		state.lastAppliedJobId = marker.jobId;
		if (state.lastHandedOffJobId === marker.jobId) state.lastHandedOffJobId = undefined;
		if (ctx.hasUI) {
			const ui = ctx.ui;
			setTimeout(() => ui.notify("Applied ready async prefix compaction", "info"), 0);
		}
	});

	pi.on("session_shutdown", (_event, ctx) => {
		markStale(state, InvalidationReason.CANCELLED);
		clearCliStatus(ctx);
	});

	pi.registerCommand("async-compact-now", {
		description: "Start async prefix compaction now",
		handler: async (_args, ctx) => {
			const message = formatManualStartOutcome(deps.startAsyncJob(ctx, state, { force: true }));
			if (message && ctx.hasUI) ctx.ui.notify(message, "info");
			if (message && !ctx.hasUI) console.log(message);
		},
	});

	pi.registerCommand("async-compact-status", {
		description: "Show async prefix compaction status",
		handler: async (_args, ctx) => {
			showStatus(ctx);
		},
	});
}
