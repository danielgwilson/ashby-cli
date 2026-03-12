---
name: ashby
description: |
  Use this skill whenever you need to inspect or update Ashby via the official API using the agent-first `ashby` CLI.
  Triggers include: candidate search, candidate lookup, Ashby application review, moving candidates between stages,
  adding candidate notes, listing jobs or stages, or keeping an Ashby hiring pipeline current without using the UI.
---

# Ashby (agent-first CLI)

Use this skill when the task touches Ashby candidates, applications, stages, or notes.

`ashby` should be installed on `$PATH`. If it is missing, install it with `npm install -g ashby-cli` or run commands with `npx ashby-cli <args>`.

Default stance:

- Prefer the official API-backed `ashby` CLI, not browser automation.
- Prefer `--json` for machine-readable output.
- Prefer read-only inspection before mutations.
- Be conservative with candidate data in logs and chat output.

## Default workflow

- Sanity check auth: `ashby doctor --json`
- Inspect key identity: `ashby whoami --json`
- Search for a candidate: `ashby candidate search --name "Jane Doe" --json`
- Or by email: `ashby candidate search --email "jane@example.com" --json`
- Inspect one candidate: `ashby candidate get <candidate-id> --json`
- List applications: `ashby application list --job-id <job-id> --status Active --json`
- List stages: `ashby stage list --interview-plan-id <plan-id> --json`

## Common mutations

- Create a candidate:
  - `ashby candidate create --name "Jane Doe" --email "jane@example.com" --json`
- Add a note:
  - `ashby note create --candidate-id <candidate-id> --note "Strong fast-track candidate" --json`
- Create an application:
  - `ashby application create --candidate-id <candidate-id> --job-id <job-id> --interview-stage-id <stage-id> --json`
- Move an application to a new stage:
  - `ashby application stage-change --application-id <application-id> --interview-stage-id <stage-id> --json`

## Auth

If `ashby doctor --json` reports missing auth:

- Best ephemeral path: `ASHBY_API_KEY=... ashby doctor --json`
- Saved local config: `printf '%s' "$ASHBY_API_KEY" | ashby auth set --stdin`

Avoid pasting full keys into logs or chat.

## Important constraints

- This CLI covers candidate/application state well, but it does not replace the full Ashby UI.
- Do not assume support for general outbound candidate email.
- Do not assume support for self-serve scheduling links or Ashby automation triggers.
- Before mutating candidate/application state, confirm ids and current stage.

## Contract

Stable JSON behavior is documented in `docs/CONTRACT_V1.md`.
