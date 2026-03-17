# ashby-cli

Agent-first CLI for Ashby's official API.

This CLI is intended for operational workflows around:

- candidate search and lookup
- application creation and stage movement
- candidate notes
- application history and feedback
- interview schedules
- synthetic feed reconstruction from public API surfaces
- hiring pipeline state

It is intentionally scoped to **state and workflow mutation**, not the full Ashby UI surface.

## Install

Package name: `ashby-cli`  
Binary name: `ashby`

```bash
npm install -g ashby-cli
```

If you do not want a global install, invoke the published package directly:

```bash
npx -y ashby-cli doctor --json
```

Or from source:

```bash
git clone https://github.com/danielgwilson/ashby-cli.git
cd ashby-cli
npm install
npm run build
```

## Auth

Ashby uses HTTP Basic auth with the API key as the username and a blank password.

Ashby does not expose OAuth for this API. The easiest human setup path is browser-assisted API key creation.

You can either:

- set `ASHBY_API_KEY`
- or store the key locally

```bash
ashby auth setup
ashby auth set --stdin
ashby auth status
ashby doctor
```

If you are using `npx`, remember it will not load `.env.local` automatically. Export `ASHBY_API_KEY` first or source your env file in the shell.

### Recommended first-time setup

```bash
ashby auth setup
```

This will:

- open the Ashby API key admin page
- remind you which permissions to enable
- accept a pasted API key
- save it locally
- validate it immediately

If you prefer not to install globally:

```bash
npx -y ashby-cli auth setup
```

## Commands

### Auth

```bash
ashby auth set --stdin
ashby auth status --json
ashby auth clear
```

### Health / identity

```bash
ashby doctor --json
ashby whoami --json
```

### Candidates

```bash
ashby candidate search --name "Jane Doe" --json
ashby candidate search --email "jane@example.com" --json
ashby candidate search --name "Jane Doe" --email "jane@example.com" --json
ashby candidate get <candidate-id> --json
ashby candidate notes --candidate-id <candidate-id> --json
ashby candidate create --name "Jane Doe" --email "jane@example.com" --linkedin-url "https://linkedin.com/in/jane" --json
ashby note create --candidate-id <candidate-id> --note "Strong fast-track candidate" --json
```

### Applications

```bash
ashby application list --job-id <job-id> --status Active --json
ashby application get <application-id> --json
ashby application history --application-id <application-id> --json
ashby application feedback --application-id <application-id> --json
ashby application feed --application-id <application-id> --json
ashby application create --candidate-id <candidate-id> --job-id <job-id> --interview-stage-id <stage-id> --json
ashby application stage-change --application-id <application-id> --interview-stage-id <stage-id> --json
```

### Pipeline metadata

```bash
ashby stage list --interview-plan-id <plan-id> --json
ashby interview schedules --application-id <application-id> --json
ashby interview events --application-id <application-id> --json
```

## Design notes

- Official-API-first
- JSON-first
- Explicit mutations
- Small supported surface

## What this CLI does not try to do

- general outbound candidate email
- candidate self-serve scheduling link generation
- full Ashby UI automation

## Feed coverage

`ashby application feed` reconstructs a useful candidate/application timeline from public API data:

- application history
- candidate notes
- feedback
- interview schedules
- nested interview events

It does **not** provide full parity with the Ashby web UI feed. In particular, public API coverage still appears weak or absent for:

- synced/sent email thread history
- text thread history
- the exact fully merged UI feed object

See `docs/CONTRACT_V1.md` for the stable CLI contract.
