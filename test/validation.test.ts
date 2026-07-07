import { describe, expect, test } from "bun:test";
import { validateReadyJob } from "../src/validation";
import { assistantEntry, readyJob, userEntry, validationContext, validationEvent } from "./test-fixtures";

describe("validateReadyJob", () => {
	test("accepts a ready job when the snapshot leaf and raw tail are still on the current branch", () => {
		const entries = [
			userEntry("u1", null, "old prefix"),
			assistantEntry("a1", "u1", "old assistant"),
			userEntry("u2", "a1", "raw tail starts here"),
			assistantEntry("a2", "u2", "snapshot leaf"),
			userEntry("u3", "a2", "appended after snapshot"),
		];

		expect(validateReadyJob(readyJob(), validationEvent(), validationContext(entries))).toBeUndefined();
	});

	test("rejects custom compaction instructions", () => {
		const entries = [userEntry("u1", null, "old prefix"), userEntry("u2", "u1", "tail"), assistantEntry("a2", "u2", "leaf")];

		expect(validateReadyJob(readyJob(), validationEvent("focus on errors"), validationContext(entries))).toBe(
			"custom_instructions",
		);
	});

	test("rejects branches that no longer contain the snapshot leaf", () => {
		const entries = [userEntry("u1", null, "old prefix"), userEntry("u2", "u1", "tail"), assistantEntry("other", "u2", "leaf")];

		expect(validateReadyJob(readyJob(), validationEvent(), validationContext(entries))).toBe("snapshot_leaf_missing");
	});

	test("rejects ready jobs whose previewed post-apply context is too large", () => {
		const entries = [
			userEntry("u1", null, "old prefix"),
			assistantEntry("a1", "u1", "old assistant"),
			userEntry("u2", "a1", "raw tail starts here"),
			assistantEntry("a2", "u2", "snapshot leaf"),
			userEntry("u3", "a2", "x".repeat(2_000)),
		];

		expect(validateReadyJob(readyJob(), validationEvent(), validationContext(entries, 120))).toBe("too_large");
	});

	test("rejects ready jobs when the result first kept entry differs from the snapshot", () => {
		const entries = [
			userEntry("u1", null, "old prefix"),
			assistantEntry("a1", "u1", "old assistant"),
			userEntry("u2", "a1", "raw tail starts here"),
			assistantEntry("a2", "u2", "snapshot leaf"),
		];
		const job = readyJob({
			result: {
				...readyJob().result,
				firstKeptEntryId: "u1",
			},
		});

		expect(validateReadyJob(job, validationEvent(), validationContext(entries))).toBe("first_kept_mismatch");
	});
});
