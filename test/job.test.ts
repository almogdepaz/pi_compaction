import { describe, expect, test } from "bun:test";
import type { CompactionResult } from "@earendil-works/pi-coding-agent";
import { InvalidationReason } from "../src/constants";
import { startAsyncJobWithDeps } from "../src/job";
import { createRuntimeState } from "../src/runtime-state";
import { settingsKey } from "../src/utils";
import {
	assistantEntry,
	asyncJobContext,
	asyncJobDeps,
	compactableEntries,
	readyJob,
	settings,
} from "./test-fixtures";

describe("startAsyncJob lifecycle", () => {
	test("does not start when disabled", () => {
		const state = createRuntimeState();

		startAsyncJobWithDeps(asyncJobContext(compactableEntries()), state, asyncJobDeps({ isEnabled: () => false }));

		expect(state.status).toBe("idle");
		expect(state.jobId).toBeUndefined();
	});

	test("sets cli status line while a background job is pending", () => {
		const state = createRuntimeState();
		const never = new Promise<never>(() => {});
		const statusValues: Array<string | undefined> = [];

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({
				buildAsyncCompactionResult: () => never,
				setCliStatus: (_ctx, text) => statusValues.push(text),
			}),
		);

		expect(state.status).toBe("pending");
		expect(state.jobId).toBe("async-prefix-compaction-1");
		expect(statusValues).toEqual(["async_compaction ..."]);
	});

	test("starts a pending job below the async threshold when forced", () => {
		const state = createRuntimeState();
		const never = new Promise<never>(() => {});

		const outcome = startAsyncJobWithDeps(
			asyncJobContext(compactableEntries(), 100),
			state,
			asyncJobDeps({ buildAsyncCompactionResult: () => never }),
			{ force: true },
		);

		expect(outcome).toBe("started");
		expect(state.status).toBe("pending");
		expect(state.jobId).toBe("async-prefix-compaction-1");
	});

	test("does not auto-start when reserve leaves no start window", () => {
		const state = createRuntimeState();
		let buildCalls = 0;

		const outcome = startAsyncJobWithDeps(
			asyncJobContext(compactableEntries(), 30_000, 32_000),
			state,
			asyncJobDeps({
				buildAsyncCompactionResult: async (preparation) => {
					buildCalls++;
					return {
						summary: "async summary",
						firstKeptEntryId: preparation.firstKeptEntryId,
						tokensBefore: preparation.tokensBefore,
						details: { readFiles: [], modifiedFiles: [] },
					};
				},
				getCompactionSettings: () => ({ ...settings, reserveTokens: 16_384 }),
			}),
		);

		expect(outcome).toBe("start_window_empty");
		expect(state.status).toBe("idle");
		expect(buildCalls).toBe(0);
	});

	test("clears cli status line when a background job becomes ready", async () => {
		const state = createRuntimeState();
		const statusValues: Array<string | undefined> = [];

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({ setCliStatus: (_ctx, text) => statusValues.push(text) }),
		);
		await Promise.resolve();

		expect(state.status).toBe("ready");
		expect(state.ready?.result.summary).toBe("async summary");
		expect(state.ready?.result.details?.asyncPrefixCompaction.jobId).toBe("async-prefix-compaction-1");
		expect(statusValues).toEqual(["async_compaction ...", undefined]);
	});

	test("triggers Pi compaction when a background job becomes ready", async () => {
		const state = createRuntimeState();
		let compactTriggered = 0;

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
		);
		await Promise.resolve();

		expect(compactTriggered).toBe(1);
	});

	test("manual force triggers Pi compaction when a reusable ready job already exists", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = "async-prefix-compaction-1";
		state.jobCounter = 1;
		state.ready = {
			...readyJob({ snapshotLeafId: "u2" }),
			jobId: "async-prefix-compaction-1",
			snapshotLeafId: "u2",
		};
		let compactTriggered = 0;

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries(), 100),
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
			{ force: true },
		);

		expect(compactTriggered).toBe(1);
	});

	test("records apply failures reported by Pi compaction", async () => {
		const state = createRuntimeState();

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({ triggerCompaction: (_ctx, onError) => onError(new Error("already compacted")) }),
		);
		await Promise.resolve();

		expect(state.status).toBe("failed");
		expect(state.reason).toBe(InvalidationReason.FAILED);
		expect(state.error).toBe("apply failed: already compacted");
	});

	test("records apply failures after a ready job has been handed off", async () => {
		const state = createRuntimeState();
		let onApplyError: ((error: Error) => void) | undefined;

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({ triggerCompaction: (_ctx, onError) => (onApplyError = onError) }),
		);
		await Promise.resolve();

		expect(state.status).toBe("ready");
		expect(state.jobId).toBe("async-prefix-compaction-1");
		state.status = "idle";
		state.ready = undefined;
		state.reason = undefined;
		state.lastHandedOffJobId = "async-prefix-compaction-1";

		onApplyError?.(new Error("render failed"));

		expect(String(state.status)).toBe("failed");
		expect(String(state.reason)).toBe(InvalidationReason.FAILED);
		expect(state.error).toBe("apply failed: render failed");
	});

	test("marks timeout aborts stale with a timeout reason", async () => {
		const state = createRuntimeState();

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({
				getTimeoutMs: () => 1,
				buildAsyncCompactionResult: (_preparation, _model, _ctx, _thinkingLevel, signal) =>
					new Promise((_, reject) => {
						signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					}),
			}),
		);
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(state.status).toBe("stale");
		expect(state.reason).toBe(InvalidationReason.TIMEOUT);
	});

	test("manual force uses the configured timeout", async () => {
		const state = createRuntimeState();

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({
				getTimeoutMs: () => 1,
				buildAsyncCompactionResult: (_preparation, _model, _ctx, _thinkingLevel, signal) =>
					new Promise((_, reject) => {
						signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					}),
			}),
			{ force: true },
		);
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(state.status).toBe("stale");
		expect(state.reason).toBe(InvalidationReason.TIMEOUT);
	});

	test("timeout clears pending state even when background compaction never settles", async () => {
		const state = createRuntimeState();
		const statusValues: Array<string | undefined> = [];
		const never = new Promise<CompactionResult>(() => {});

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({
				getTimeoutMs: () => 1,
				setCliStatus: (_ctx, text) => statusValues.push(text),
				buildAsyncCompactionResult: () => never,
			}),
		);
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(state.status).toBe("stale");
		expect(state.reason).toBe(InvalidationReason.TIMEOUT);
		expect(statusValues).toEqual(["async_compaction ...", undefined]);
	});

	test("records background compaction failures", async () => {
		const state = createRuntimeState();

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({ buildAsyncCompactionResult: async () => Promise.reject(new Error("auth failed")) }),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(state.status).toBe("failed");
		expect(state.reason).toBe(InvalidationReason.FAILED);
		expect(state.error).toBe("auth failed");
	});

	test("records empty background compaction summaries as actionable failures", async () => {
		const state = createRuntimeState();

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({
				buildAsyncCompactionResult: async (preparation) => ({
					summary: "  \n\t  ",
					firstKeptEntryId: preparation.firstKeptEntryId,
					tokensBefore: preparation.tokensBefore,
				}),
			}),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(state.status).toBe("failed");
		expect(state.reason).toBe(InvalidationReason.FAILED);
		expect(state.error).toBe("empty compaction summary");
	});

	test("replaces an unchanged-leaf ready job when settings drift", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = "async-prefix-compaction-1";
		state.jobCounter = 1;
		state.ready = readyJob({ snapshotLeafId: "u2" });
		const changedSettings = { ...settings, reserveTokens: 101 };
		const never = new Promise<CompactionResult>(() => {});

		const outcome = startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({
				getCompactionSettings: () => changedSettings,
				buildAsyncCompactionResult: () => never,
			}),
		);

		expect(outcome).toBe("started");
		expect(String(state.status)).toBe("pending");
		expect(state.jobId).toBe("async-prefix-compaction-2");
	});

	test("replaces a ready job when appended tail makes it too large", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = "async-prefix-compaction-1";
		state.jobCounter = 1;
		state.ready = {
			jobId: "async-prefix-compaction-1",
			sessionId: "session-1",
			snapshotLeafId: "a1",
			firstKeptEntryId: "u2",
			modelKey: "openai/test-model",
			thinkingLevel: "off",
			settingsKey: settingsKey(settings),
			promptVersion: "pi-compact-background-v1",
			result: {
				summary: "x".repeat(4_000),
				firstKeptEntryId: "u2",
				tokensBefore: 100,
				details: {
					readFiles: [],
					modifiedFiles: [],
					asyncPrefixCompaction: {
						jobId: "async-prefix-compaction-1",
						snapshotLeafId: "a1",
						modelKey: "openai/test-model",
						thinkingLevel: "off",
						settingsKey: settingsKey(settings),
						promptVersion: "pi-compact-background-v1",
					},
				},
			},
		};
		const entries = [...compactableEntries(), assistantEntry("a2", "u2", "new tail")];
		const never = new Promise<never>(() => {});

		startAsyncJobWithDeps(
			asyncJobContext(entries),
			state,
			asyncJobDeps({ buildAsyncCompactionResult: () => never }),
		);

		expect(String(state.status)).toBe("pending");
		expect(state.jobId).toBe("async-prefix-compaction-2");
		expect(state.ready).toBeUndefined();
	});
});
