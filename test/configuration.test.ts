import { describe, expect, test } from "bun:test";
import { getTimeoutMs } from "../src/utils";

describe("configuration helpers", () => {
	test("defaults timeout to five minutes", () => {
		const previous = process.env.PI_ASYNC_PREFIX_COMPACTION_TIMEOUT_MS;
		delete process.env.PI_ASYNC_PREFIX_COMPACTION_TIMEOUT_MS;
		try {
			expect(getTimeoutMs()).toBe(300_000);
		} finally {
			if (previous === undefined) {
				delete process.env.PI_ASYNC_PREFIX_COMPACTION_TIMEOUT_MS;
			} else {
				process.env.PI_ASYNC_PREFIX_COMPACTION_TIMEOUT_MS = previous;
			}
		}
	});
});
