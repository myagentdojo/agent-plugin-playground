import { join } from "node:path"

import {
	invalidAgentAttentionStopInput,
	runAgentAttentionStop,
	type AgentAttentionStopRuntime,
} from "./stop"

interface ProcessResult {
	exitCode: number
	stdout: string
	stderr: string
}

function pythonExecutable(): string {
	return process.env.AGENT_ATTENTION_PYTHON || "python3"
}

async function runPython(arguments_: string[], timeout?: number): Promise<ProcessResult> {
	const owner = join(import.meta.dir, "agent-attention.py")
	try {
		const child = Bun.spawn([pythonExecutable(), owner, ...arguments_], {
			stdin: "inherit",
			stdout: "pipe",
			stderr: "pipe",
			...(timeout === undefined ? {} : { timeout }),
		})
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		])
		return { exitCode, stdout, stderr }
	} catch (error) {
		const detail = error instanceof Error ? error.message : "unknown error"
		return {
			exitCode: 1,
			stdout: `${JSON.stringify({
				status: "error",
				changed: false,
				retry_safe: false,
				error_category: "missing_python",
				next_safe_action: "Install python3 in a standard system location, then retry.",
			})}\n`,
			stderr: `Agent Attention could not start python3: ${detail}\n`,
		}
	}
}

function installedStopRuntime(): AgentAttentionStopRuntime {
	return {
		checkStop: async (threadId) => {
			const result = await runPython(["check-stop", "--thread-id", threadId], 5_000)
			if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "owner check failed")
			const parsed = JSON.parse(result.stdout) as { hook_action?: unknown; reason?: unknown }
			if (parsed.hook_action !== "allow" && parsed.hook_action !== "continue") {
				throw new Error("Agent Attention stop check returned an invalid action")
			}
			return {
				hook_action: parsed.hook_action,
				...(typeof parsed.reason === "string" ? { reason: parsed.reason } : {}),
			}
		},
	}
}

async function main(): Promise<number> {
	const arguments_ = process.argv.slice(2)
	if (arguments_[0] === "hook-stop") {
		let input: unknown
		try {
			input = await Bun.stdin.json()
		} catch {
			process.stdout.write(`${JSON.stringify(invalidAgentAttentionStopInput())}\n`)
			return 0
		}
		const output = await runAgentAttentionStop(input, installedStopRuntime())
		process.stdout.write(`${JSON.stringify(output)}\n`)
		return 0
	}
	const result = await runPython(arguments_)
	process.stdout.write(result.stdout)
	process.stderr.write(result.stderr)
	return result.exitCode
}

process.exit(await main())
