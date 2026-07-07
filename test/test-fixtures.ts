import { readFileSync } from "node:fs";
import { expect } from "bun:test";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, SessionBeforeCompactEvent, SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { compact } from "@earendil-works/pi-coding-agent";
// test-only parity sentinel: Pi does not publicly export prepareCompaction/estimateContextTokens.
// if this private path breaks, update the sentinel or switch to a public export.
import {
	estimateContextTokens as estimatePiContextTokens,
	prepareCompaction as preparePiCompaction,
} from "../node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js";
import asyncPrefixCompaction from "../src/index";
import { startAsyncJobWithDeps } from "../src/job";
import { prepareAsyncCompaction } from "../src/preparation";
import { validateReadyJob } from "../src/validation";

export { estimatePiContextTokens, preparePiCompaction };

export const timestamp = "2026-06-30T00:00:00.000Z";
export const settings = {
	enabled: true,
	reserveTokens: 100,
	keepRecentTokens: 1,
};

export function userEntry(id: string, parentId: string | null, text: string): SessionMessageEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp,
		message: {
			role: "user",
			content: [{ type: "text", text }],
			timestamp: Date.parse(timestamp),
		},
	};
}

export function assistantEntry(id: string, parentId: string, text: string, totalTokens = 2): SessionMessageEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp,
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			api: "openai-completions",
			provider: "openai",
			model: "test-model",
			usage: {
				input: totalTokens,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.parse(timestamp),
		},
	};
}

export function assistantToolEntry(id: string, parentId: string, toolName: string, path: string): SessionMessageEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp,
		message: {
			role: "assistant",
			content: [
				{
					type: "toolCall",
					id: `${id}-tool`,
					name: toolName,
					arguments: { path },
				},
			],
			api: "openai-completions",
			provider: "openai",
			model: "test-model",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "toolUse",
			timestamp: Date.parse(timestamp),
		},
	};
}

export function compactionEntry(
	id: string,
	parentId: string,
	fromHook: boolean | undefined,
	details: unknown,
): SessionEntry {
	return {
		type: "compaction",
		id,
		parentId,
		timestamp,
		summary: `${id} summary`,
		firstKeptEntryId: "u1",
		tokensBefore: 100,
		fromHook,
		details,
	};
}

export function ownAsyncMarker(): Record<string, unknown> {
	return {
		asyncPrefixCompaction: {
			jobId: "async-prefix-compaction-1",
			snapshotLeafId: "a1",
			modelKey: "openai/test-model",
			thinkingLevel: "off",
			settingsKey: JSON.stringify(settings),
			promptVersion: "pi-compact-background-v1",
		},
	};
}

export function testModel(contextWindow = 1_000): Model<Api> {
	return {
		id: "test-model",
		name: "test-model",
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens: 100,
	};
}

export function validationEvent(customInstructions?: string): SessionBeforeCompactEvent {
	return {
		type: "session_before_compact",
		customInstructions,
		reason: "manual",
		willRetry: false,
		signal: new AbortController().signal,
		branchEntries: [],
		preparation: {
			firstKeptEntryId: "u2",
			messagesToSummarize: [],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 100,
			fileOps: { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() },
			settings,
		},
	};
}

export function validationContext(entries: readonly SessionEntry[], contextWindow = 1_000): ExtensionContext {
	return {
		model: testModel(contextWindow),
		sessionManager: {
			getSessionId: () => "session-1",
			getBranch: () => [...entries],
			getLeafId: () => entries[entries.length - 1]?.id ?? null,
		},
	} as ExtensionContext;
}

export function asyncJobContext(entries: readonly SessionEntry[], usageTokens = 850, contextWindow = 1_000): ExtensionContext {
	return {
		cwd: process.cwd(),
		model: testModel(contextWindow),
		getContextUsage: () => ({ tokens: usageTokens, contextWindow }),
		sessionManager: {
			getSessionId: () => "session-1",
			getBranch: () => [...entries],
			getLeafId: () => entries[entries.length - 1]?.id ?? null,
		},
	} as ExtensionContext;
}

export function manualCommandEntries(): SessionEntry[] {
	return [
		userEntry("u1", null, "old prefix"),
		assistantEntry("a1", "u1", "x".repeat(100_000), 30_000),
		userEntry("u2", "a1", "raw tail starts here"),
	];
}

export function manualCommandContext(entries: readonly SessionEntry[] = manualCommandEntries()): ExtensionContext {
	return {
		...asyncJobContext(entries, 100),
		hasUI: true,
		ui: {
			notify: () => undefined,
			setStatus: () => undefined,
		},
		modelRegistry: {
			getApiKeyAndHeaders: () => new Promise<never>(() => {}),
		},
		compact: () => undefined,
	} as unknown as ExtensionContext;
}

export function compactableEntries(): SessionEntry[] {
	return [
		userEntry("u1", null, "old prefix"),
		assistantEntry("a1", "u1", "old assistant"),
		userEntry("u2", "a1", "raw tail starts here"),
	];
}

export function asyncJobDeps(overrides: Partial<Parameters<typeof startAsyncJobWithDeps>[2]> = {}): Parameters<typeof startAsyncJobWithDeps>[2] {
	return {
		buildAsyncCompactionResult: async (preparation) => ({
			summary: "async summary",
			firstKeptEntryId: preparation.firstKeptEntryId,
			tokensBefore: preparation.tokensBefore,
			details: { readFiles: [], modifiedFiles: [] },
		}),
		getCompactionSettings: () => settings,
		getStartRatio: () => 0.8,
		getTimeoutMs: () => 0,
		isEnabled: () => true,
		setCliStatus: () => undefined,
		triggerCompaction: () => undefined,
		...overrides,
	};
}

export function extensionHarness(deps?: Parameters<typeof asyncPrefixCompaction>[1]): {
	readonly handlers: Map<string, (event: unknown, ctx: ExtensionContext) => unknown>;
	readonly commands: Map<string, { readonly handler: (args: string, ctx: ExtensionContext) => unknown }>;
	readonly notifyMessages: string[];
	readonly statusValues: Array<string | undefined>;
	readonly toolExpansionValues: boolean[];
	readonly ctx: ExtensionContext;
} {
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
	const commands = new Map<string, { readonly handler: (args: string, ctx: ExtensionContext) => unknown }>();
	const pi = {
		on: (eventName: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
			handlers.set(eventName, handler);
		},
		registerCommand: (name: string, command: { readonly handler: (args: string, ctx: ExtensionContext) => unknown }) => {
			commands.set(name, command);
		},
	} as unknown as ExtensionAPI;
	const notifyMessages: string[] = [];
	const statusValues: Array<string | undefined> = [];
	const toolExpansionValues: boolean[] = [];
	const ctx = {
		hasUI: true,
		ui: {
			notify: (message: string) => {
				notifyMessages.push(message);
			},
			setStatus: (_key: string, text: string | undefined) => {
				statusValues.push(text);
			},
			setToolsExpanded: (expanded: boolean) => {
				toolExpansionValues.push(expanded);
			},
		},
	} as unknown as ExtensionContext;

	asyncPrefixCompaction(pi, deps);

	return { handlers, commands, notifyMessages, statusValues, toolExpansionValues, ctx };
}

export function readyJob(overrides: Partial<Parameters<typeof validateReadyJob>[0]> = {}): Parameters<typeof validateReadyJob>[0] {
	return {
		jobId: "async-prefix-compaction-1",
		sessionId: "session-1",
		snapshotLeafId: "a2",
		firstKeptEntryId: "u2",
		modelKey: "openai/test-model",
		thinkingLevel: "off",
		settingsKey: JSON.stringify(settings),
		promptVersion: "pi-compact-background-v1",
		result: {
			summary: "summary",
			firstKeptEntryId: "u2",
			tokensBefore: 100,
			details: {
				readFiles: [],
				modifiedFiles: [],
				asyncPrefixCompaction: {
					jobId: "async-prefix-compaction-1",
					snapshotLeafId: "a2",
					modelKey: "openai/test-model",
					thinkingLevel: "off",
					settingsKey: JSON.stringify(settings),
					promptVersion: "pi-compact-background-v1",
				},
			},
		},
		...overrides,
	};
}

export function expectAsyncPreparationToMatchPi(
	entries: readonly SessionEntry[],
	compactionSettings: typeof settings,
): void {
	const asyncPreparation = prepareAsyncCompaction(entries, compactionSettings);
	const piPreparation = preparePiCompaction([...entries], compactionSettings);

	if (!piPreparation) {
		expect(asyncPreparation).toBeUndefined();
		return;
	}

	if (!asyncPreparation) {
		throw new Error("Async preparation missing when Pi prepared compaction");
	}

	expect(asyncPreparation.firstKeptEntryId).toBe(piPreparation.firstKeptEntryId);
	expect(asyncPreparation.messagesToSummarize.map((message) => message.role)).toEqual(
		piPreparation.messagesToSummarize.map((message) => message.role),
	);
	expect(asyncPreparation.turnPrefixMessages.map((message) => message.role)).toEqual(
		piPreparation.turnPrefixMessages.map((message) => message.role),
	);
	expect(asyncPreparation.isSplitTurn).toBe(piPreparation.isSplitTurn);
	expect(asyncPreparation.tokensBefore).toBe(piPreparation.tokensBefore);
	expect(asyncPreparation.previousSummary).toBe(piPreparation.previousSummary);
	expect([...asyncPreparation.fileOps.read].sort()).toEqual([...piPreparation.fileOps.read].sort());
	expect([...asyncPreparation.fileOps.written].sort()).toEqual([...piPreparation.fileOps.written].sort());
	expect([...asyncPreparation.fileOps.edited].sort()).toEqual([...piPreparation.fileOps.edited].sort());
}

export function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

export function textBlocksFromContent(content: unknown): string[] {
	if (!Array.isArray(content)) return [];
	return content.flatMap((block) => {
		const fields = recordFromUnknown(block);
		return fields?.type === "text" && typeof fields.text === "string" ? [fields.text] : [];
	});
}

export function textBlocksFromMessage(message: unknown): string[] {
	return textBlocksFromContent(recordFromUnknown(message)?.content);
}

export function deterministicSummaryText(messages: readonly unknown[]): string {
	const text = messages
		.flatMap((message) => {
			if (!message || typeof message !== "object" || Array.isArray(message)) return [];
			return textBlocksFromContent((message as Record<string, unknown>).content);
		})
		.join("\n");
	return `deterministic:${text.length}:${text.slice(0, 120)}`;
}

export function realLongEdcEntries(): SessionEntry[] {
	const fixtureUrl = new URL("../test-fixtures/edc-real-long-session.jsonl", import.meta.url);
	return readFileSync(fixtureUrl, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as unknown)
		.filter((entry): entry is SessionEntry => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
			return (entry as Record<string, unknown>).type !== "session";
		});
}

export const deterministicStreamFn: NonNullable<Parameters<typeof compact>[7]> = (_model, context) => {
	const stream = createAssistantMessageEventStream();
	stream.end({
		role: "assistant",
		content: [{ type: "text", text: deterministicSummaryText(context.messages) }],
		api: "test-api",
		provider: "test-provider",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.parse(timestamp),
	});
	return stream;
};

