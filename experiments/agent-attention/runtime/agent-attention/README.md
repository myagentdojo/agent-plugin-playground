# Agent Attention approval gates

Minimal Apple Reminders approval loop for Codex tasks. This experiment preserves
the proven source and tests; it is not yet a release-qualified portable plugin
payload.

## Contract

- `remindctl` owns Apple Reminders access through EventKit.
- One configured `Agent Attention` list.
- Structured router admission accepts only explicit yes/no unblockers.
- One admitted request creates one gate and one immediate native alert.
- Duplicate submission never creates a second gate or alert.
- One approval meaning per reminder.
- Preview is the default for reminder creation.
- A completed reminder can authorize one task delivery.
- Atomic claim suppresses duplicate delivery.
- A terminal outcome requires the matching delivery receipt.
- Outcome writes resolve one exact stable ID before and after editing notes.
- Outcome receipts and audit events suppress duplicate writes.
- Completed reminders remain in Apple Reminders.
- Stop hooks inspect exact structured owner state only. They never read task
  prose or transcripts for meaning.
- Private mappings, claims, and receipts live under
  `~/.local/state/agent-attention/` by default.
- A crash after claim and before delivery needs human inspection. Never release
  that claim automatically.

## Commands

```sh
python3 experiments/agent-attention/runtime/agent-attention/agent-attention.py --help
python3 experiments/agent-attention/runtime/agent-attention/agent-attention.py doctor
python3 experiments/agent-attention/runtime/agent-attention/agent-attention.py configure \
  --list-id LIST_ID \
  --list-name "Agent Attention"
python3 experiments/agent-attention/runtime/agent-attention/agent-attention.py submit --help
python3 experiments/agent-attention/runtime/agent-attention/agent-attention.py poll
python3 experiments/agent-attention/runtime/agent-attention/agent-attention.py watch --interval-seconds 5 --timeout-seconds 30
python3 experiments/agent-attention/runtime/agent-attention/agent-attention.py record-delivery \
  --event-id EVENT_ID \
  --tool-result '{"delivered":true}'
python3 experiments/agent-attention/runtime/agent-attention/agent-attention.py record-outcome \
  --reminder-id REMINDER_ID \
  --outcome "Review-ready PR opened; local checks passed." \
  --finished-at 2026-08-10T05:45:00Z
```

`poll` never sends a task message. A Codex automation owns the supported task
messaging call, then runs `record-delivery` only after success.

`submit` previews by default. It receives structured intent through parser-owned
flags, rejects anything except an explicit yes/no decision that unblocks the
exact paused task, and records actionable repair state on rejected execution.
An admitted execution creates one reminder with one immediate alarm and no due
date. Priority stays `none` unless a future explicit contract adds it.

`watch` is a bounded foreground detector. Five-second polling can meet the
15-second target while a Mac process remains awake. This repository does not
currently own a persistent global wake process, so background delivery is not
qualified until an external owner runs the watcher and invokes the supported
Codex task messaging tool.

`record-outcome` previews by default. After review, rerun with `--execute`. It
appends only one concise `Outcome:` line and one `Finished:` timestamp to the
exact already-completed reminder. It never inventories, reopens, or deletes
reminders. On an unknown edit result, inspect by rerunning the same command;
the exact reread recovers the receipt without a second edit.

Focused local proof:

```sh
bun run test:agent-attention
```

## Link handler

```sh
experiments/agent-attention/runtime/agent-attention/install-link-handler.sh
```

This installs `Agent Attention Link.app` into `~/Applications` and registers
`agent-attention://threads/<UUID>`. The handler validates the UUID, opens the
matching Codex route, then reasserts it after foreground activation.
