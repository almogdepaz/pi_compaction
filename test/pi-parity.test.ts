import { describe, expect, test } from "bun:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { compact } from "@earendil-works/pi-coding-agent";
import { prepareAsyncCompaction } from "../src/preparation";
import { estimateContextUsageTokens } from "../src/utils";
import {
	assistantEntry,
	assistantToolEntry,
	compactionEntry,
	deterministicStreamFn,
	estimatePiContextTokens,
	expectAsyncPreparationToMatchPi,
	preparePiCompaction,
	realLongEdcEntries,
	settings,
	testModel,
	userEntry,
} from "./test-fixtures";

const explicitRealParityTest = process.env.PI_RUN_REAL_COMPACTION_PARITY === "1" ? test : test.skip;

describe("Pi preparation parity sentinels", () => {
	test("matches Pi's normal preparation shape", () => {
		const entries: SessionEntry[] = [
			userEntry("u1", null, "old request"),
			assistantToolEntry("a1", "u1", "read", "old.ts"),
			userEntry("u2", "a1", "recent request"),
			assistantEntry("a2", "u2", "recent response"),
		];

		expectAsyncPreparationToMatchPi(entries, { ...settings, keepRecentTokens: 1 });
	});

	test("matches Pi's split-turn preparation shape", () => {
		const entries: SessionEntry[] = [
			userEntry("u1", null, "do the large task"),
			assistantEntry("a1", "u1", "x".repeat(1_000)),
		];

		expectAsyncPreparationToMatchPi(entries, settings);
	});

	test("matches Pi's previous-compaction preparation shape for Pi-generated compactions", () => {
		const entries: SessionEntry[] = [
			userEntry("u1", null, "kept from previous compaction"),
			assistantToolEntry("a1", "u1", "read", "kept-before-previous.ts"),
			compactionEntry("c1", "a1", undefined, {
				readFiles: ["pi-read.ts"],
				modifiedFiles: ["pi-edit.ts"],
			}),
			userEntry("u2", "c1", "new work"),
			assistantToolEntry("a2", "u2", "write", "new-write.ts"),
			userEntry("u3", "a2", "recent tail"),
		];

		expectAsyncPreparationToMatchPi(entries, { ...settings, keepRecentTokens: 1 });
	});

	test("matches Pi's no-op preparation behavior when no messages need summarizing", () => {
		const entries = [userEntry("u1", null, "short request")];
		const largeKeepRecentSettings = { ...settings, keepRecentTokens: 100_000 };

		expectAsyncPreparationToMatchPi(entries, largeKeepRecentSettings);
	});

	test("matches Pi's zero-usage fallback when estimating context tokens", () => {
		const messages = [
			assistantEntry("a1", "u1", "old usage", 12_345).message,
			userEntry("u2", "a1", "tail").message,
			assistantEntry("a2", "u2", "x", 0).message,
		];

		expect(estimateContextUsageTokens(messages)).toBe(estimatePiContextTokens(messages).tokens);
	});

	explicitRealParityTest("produces the same deterministic compaction result as Pi for a real long edc conversation", async () => {
		const entries = realLongEdcEntries();
		const contextWindow = 400_000;
		const maxRecordedTokens = Math.max(
			...entries.map((entry) =>
				entry.type === "message" && entry.message.role === "assistant" ? (entry.message.usage?.totalTokens ?? 0) : 0,
			),
		);
		expect(maxRecordedTokens).toBeGreaterThan(contextWindow / 2);

		const compactionSettings = { ...settings, keepRecentTokens: 20_000 };
		const asyncPreparation = prepareAsyncCompaction(entries, compactionSettings);
		const piPreparation = preparePiCompaction([...entries], compactionSettings);
		if (!asyncPreparation || !piPreparation) throw new Error("Expected both preparation paths to produce compaction input");

		const [asyncResult, piResult] = await Promise.all([
			compact(asyncPreparation, testModel(contextWindow), "test-key", {}, undefined, new AbortController().signal, "off", deterministicStreamFn),
			compact(piPreparation, testModel(contextWindow), "test-key", {}, undefined, new AbortController().signal, "off", deterministicStreamFn),
		]);

		expect(asyncResult).toEqual(piResult);
	});
});
