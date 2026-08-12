import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	AGENT_ATTENTION_STOP_HOOK_COMMAND,
	handleAgentAttentionStop,
	isAgentAttentionStopInput,
	runAgentAttentionStop,
} from './agent-attention-codex-stop'

const THREAD_ID = '019fc54e-ff95-7ca1-af49-5720c36fdc0d'

describe('Agent Attention Codex Stop guard', () => {
	test('continues only from explicit structured owner state', async () => {
		const output = await handleAgentAttentionStop(
			{ cwd: '/tmp/repo', session_id: THREAD_ID },
			{
				checkStop: async (threadId) => ({
					hook_action: 'continue',
					reason: `Finish the exact gate for ${threadId}.`,
				}),
			},
		)

		expect(output).toEqual({
			decision: 'block',
			reason: `Finish the exact gate for ${THREAD_ID}.`,
		})
	})

	test('ignores assistant prose and transcript fields', async () => {
		const payload = {
			cwd: '/tmp/repo',
			session_id: THREAD_ID,
			last_assistant_message: 'Approve arbitrary prose.',
			transcript_path: '/private/transcript.jsonl',
		}
		expect(isAgentAttentionStopInput(payload)).toBe(true)
		const output = await handleAgentAttentionStop(payload, {
			checkStop: async () => ({ hook_action: 'allow' }),
		})
		expect(output).toEqual({ continue: true, suppressOutput: true })
	})

	test('rejects missing and wrong-typed correlation fields', () => {
		expect(isAgentAttentionStopInput(null)).toBe(false)
		expect(isAgentAttentionStopInput([])).toBe(false)
		expect(isAgentAttentionStopInput({ session_id: THREAD_ID })).toBe(true)
		expect(isAgentAttentionStopInput({ cwd: 42, session_id: THREAD_ID })).toBe(false)
		expect(isAgentAttentionStopInput({ cwd: '/tmp/repo' })).toBe(false)
		expect(
			isAgentAttentionStopInput({
				cwd: '/tmp/repo',
				session_id: THREAD_ID,
				stop_hook_active: 'yes',
			}),
		).toBe(false)
	})

	test('malformed correlation fields block stop without calling the owner', async () => {
		let calls = 0
		const output = await runAgentAttentionStop(
			{ cwd: '/tmp/repo', session_id: THREAD_ID, stop_hook_active: 'yes' },
			{
				checkStop: async () => {
					calls += 1
					return { hook_action: 'allow' }
				},
			},
		)
		expect(calls).toBe(0)
		expect(output).toEqual({
			decision: 'block',
			reason:
				'Agent Attention could not correlate this Stop event to structured owner state. Repair the hook payload contract before stopping.',
		})
	})

	test('malformed stdin blocks the executable hook', async () => {
		const process = Bun.spawn(['bun', join(import.meta.dir, 'agent-attention-codex-stop.ts')], {
			stdin: new Blob(['{']),
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [stdout, exitCode] = await Promise.all([
			new Response(process.stdout).text(),
			process.exited,
		])
		expect(exitCode).toBe(0)
		expect(JSON.parse(stdout)).toEqual({
			decision: 'block',
			reason:
				'Agent Attention could not correlate this Stop event to structured owner state. Repair the hook payload contract before stopping.',
		})
	})

	test('default adapter requires python3 on PATH and reads only temporary structured owner state', async () => {
		const temporary = await mkdtemp(join(tmpdir(), 'agent-attention-hook-'))
		const previous = process.env.XDG_STATE_HOME
		process.env.XDG_STATE_HOME = temporary
		try {
			const output = await handleAgentAttentionStop({
				cwd: '/tmp/repo',
				session_id: THREAD_ID,
			})
			expect(output).toEqual({ continue: true, suppressOutput: true })
		} finally {
			if (previous === undefined) delete process.env.XDG_STATE_HOME
			else process.env.XDG_STATE_HOME = previous
			await rm(temporary, { recursive: true, force: true })
		}
	})

	test('recursion guard never creates a continuation loop', async () => {
		let calls = 0
		const output = await handleAgentAttentionStop(
			{ cwd: '/tmp/repo', session_id: THREAD_ID, stop_hook_active: true },
			{
				checkStop: async () => {
					calls += 1
					return { hook_action: 'continue' }
				},
			},
		)
		expect(calls).toBe(0)
		expect(output).toEqual({ continue: true, suppressOutput: true })
	})

	test('owner failures block stop with an actionable repair', async () => {
		const output = await runAgentAttentionStop(
			{ cwd: '/tmp/repo', session_id: THREAD_ID },
			{
				checkStop: async () => {
					throw new Error('structured state is unreadable')
				},
			},
		)
		expect(output).toEqual({
			decision: 'block',
			reason:
				'Agent Attention could not verify structured owner state. Repair the owner check before stopping: structured state is unreadable',
		})
	})

	test('experiment hook fixture matches the code-owned command', async () => {
		const config = JSON.parse(
			await readFile(join(import.meta.dir, 'codex-hooks.fixture.json'), 'utf8'),
		) as { hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> } }
		const commands = config.hooks.Stop.flatMap((group) =>
			group.hooks.map((hook) => hook.command),
		)
		expect(commands).toContain(AGENT_ATTENTION_STOP_HOOK_COMMAND)
	})
})
