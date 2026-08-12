#!/usr/bin/env bun

import { join } from 'node:path'

import {
	handleAgentAttentionStop as handleInstalledStop,
	invalidAgentAttentionStopInput,
	isAgentAttentionStopInput,
	runAgentAttentionStop as runInstalledStop,
	type AgentAttentionStopCheck,
	type AgentAttentionStopInput,
	type AgentAttentionStopOutput,
	type AgentAttentionStopRuntime,
} from '../../../packages/agent-attention/src/stop'

export { isAgentAttentionStopInput }

/** Experiment-local Codex hook command kept aligned with its fixture. */
export const AGENT_ATTENTION_STOP_HOOK_COMMAND =
	'bun "$(git rev-parse --show-toplevel)/experiments/agent-attention/hooks/agent-attention-codex-stop.ts"'

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
	return handleInstalledStop(input, runtime)
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
	return runInstalledStop(input, runtime)
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
		process.stdout.write(`${JSON.stringify(invalidAgentAttentionStopInput())}\n`)
	}
}
