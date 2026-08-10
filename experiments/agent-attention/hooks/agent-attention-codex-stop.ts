#!/usr/bin/env bun

import { join } from 'node:path'

/** Experiment-local Codex hook command kept aligned with its fixture. */
export const AGENT_ATTENTION_STOP_HOOK_COMMAND =
	'bun "$(git rev-parse --show-toplevel)/experiments/agent-attention/hooks/agent-attention-codex-stop.ts"'

/** Stable Stop fields used to correlate one exact task with owner state. */
export interface AgentAttentionStopInput {
	cwd: string
	session_id: string
	stop_hook_active?: boolean
}

/** Minimal owner result consumed by the hook adapter. */
export interface AgentAttentionStopCheck {
	hook_action: 'allow' | 'continue'
	reason?: string
}

/** Injectable owner seam for public-hook tests. */
export interface AgentAttentionStopRuntime {
	checkStop: (threadId: string) => Promise<AgentAttentionStopCheck>
}

/** Codex Stop output that either permits stop or requests one continuation. */
export type AgentAttentionStopOutput =
	| { continue: true; suppressOutput: true }
	| { decision: 'block'; reason: string }

const INVALID_STOP_INPUT: AgentAttentionStopOutput = {
	decision: 'block',
	reason:
		'Agent Attention could not correlate this Stop event to structured owner state. Repair the hook payload contract before stopping.',
}

/**
 * Validate only the stable task-correlation fields needed by the owner.
 *
 * @param value - Untrusted Codex hook payload
 * @returns True when the hook can correlate one exact task
 *
 * @example
 * ```ts
 * isAgentAttentionStopInput({ cwd: '/tmp/repo', session_id: crypto.randomUUID() })
 * ```
 */
export function isAgentAttentionStopInput(
	value: unknown,
): value is AgentAttentionStopInput {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const input = value as Record<string, unknown>
	if (typeof input.cwd !== 'string' || input.cwd.trim() === '') return false
	if (typeof input.session_id !== 'string' || input.session_id.trim() === '') {
		return false
	}
	if (
		input.stop_hook_active !== undefined &&
		typeof input.stop_hook_active !== 'boolean'
	) {
		return false
	}
	return true
}

/**
 * Enforce explicit owner state without reading assistant prose or transcripts.
 *
 * @param input - Validated Codex Stop payload
 * @param runtime - Structured Agent Attention owner adapter
 * @returns Codex Stop continuation decision
 * @throws When the owner check cannot run or returns invalid JSON
 *
 * @example
 * ```ts
 * await handleAgentAttentionStop(input, runtime)
 * ```
 */
export async function handleAgentAttentionStop(
	input: AgentAttentionStopInput,
	runtime: AgentAttentionStopRuntime = createDefaultRuntime(),
): Promise<AgentAttentionStopOutput> {
	if (input.stop_hook_active) {
		return { continue: true, suppressOutput: true }
	}
	const check = await runtime.checkStop(input.session_id)
	if (check.hook_action === 'continue') {
		return {
			decision: 'block',
			reason:
				check.reason ??
				'Agent Attention owner state requires an actionable repair before stopping.',
		}
	}
	return { continue: true, suppressOutput: true }
}

/**
 * Convert owner failures into an actionable stop block.
 *
 * @param input - Untrusted Codex Stop payload
 * @param runtime - Structured Agent Attention owner adapter
 * @returns A safe stop decision
 */
export async function runAgentAttentionStop(
	input: unknown,
	runtime: AgentAttentionStopRuntime = createDefaultRuntime(),
): Promise<AgentAttentionStopOutput> {
	if (!isAgentAttentionStopInput(input)) {
		return INVALID_STOP_INPUT
	}
	try {
		return await handleAgentAttentionStop(input, runtime)
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'unknown error'
		return {
			decision: 'block',
			reason: `Agent Attention could not verify structured owner state. Repair the owner check before stopping: ${detail}`,
		}
	}
}

function createDefaultRuntime(): AgentAttentionStopRuntime {
	return {
		checkStop: async (threadId) => {
			const owner = join(
				import.meta.dir,
				'..',
				'runtime',
				'agent-attention',
				'agent-attention.py',
			)
			const process = Bun.spawn(
				['python3', owner, 'check-stop', '--thread-id', threadId],
				{ stdout: 'pipe', stderr: 'pipe', timeout: 5000 },
			)
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(process.stdout).text(),
				new Response(process.stderr).text(),
				process.exited,
			])
			if (exitCode !== 0) {
				throw new Error(stderr.trim() || 'Agent Attention stop check failed')
			}
			const result = JSON.parse(stdout) as Partial<AgentAttentionStopCheck>
			if (result.hook_action !== 'allow' && result.hook_action !== 'continue') {
				throw new Error('Agent Attention stop check returned an invalid action')
			}
			return {
				hook_action: result.hook_action,
				...(typeof result.reason === 'string' ? { reason: result.reason } : {}),
			}
		},
	}
}

if (import.meta.main) {
	try {
		const parsed = await Bun.stdin.json()
		const output = await runAgentAttentionStop(parsed)
		process.stdout.write(`${JSON.stringify(output)}\n`)
	} catch {
		process.stdout.write(`${JSON.stringify(INVALID_STOP_INPUT)}\n`)
	}
}
