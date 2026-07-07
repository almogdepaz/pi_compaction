import { describe, expect, test } from "bun:test";
import { InvalidationReason } from "../src/constants";
import { getAbortInvalidationReason } from "../src/runtime-state";

describe("runtime state helpers", () => {
	test("reports timeout aborts distinctly from lifecycle cancellation", () => {
		expect(getAbortInvalidationReason(true)).toBe(InvalidationReason.TIMEOUT);
		expect(getAbortInvalidationReason(false)).toBe(InvalidationReason.CANCELLED);
	});
});
