# Agent Attention experiment

Source-and-test migration of the Agent Attention V2 prototype into the private
plugin playground.

## Included

- EventKit-backed Python CLI and focused fake-`remindctl` tests.
- Exact-task Codex Stop adapter and focused Bun tests.
- Native link-handler source.
- Thin skill source.

## Boundary

This capsule preserves the current implementation for review and iteration. It
does not claim a release-qualified plugin payload, persistent background wake,
or live Apple Reminders proof. The generated plugin manifests remain owned by
`plugin.config.json`; do not hand-edit them to activate this experiment.

## Verify

```sh
bun run test:agent-attention
```
