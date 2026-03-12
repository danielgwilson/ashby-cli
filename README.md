# ashby-cli

Agent-first CLI for Ashby's official API.

This CLI is intended for operational workflows around:

- candidate search and lookup
- application creation and stage movement
- candidate notes
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

You can either:

- set `ASHBY_API_KEY`
- or store the key locally

```bash
ashby auth set --stdin
ashby auth status
ashby doctor
```

If you are using `npx`, remember it will not load `.env.local` automatically. Export `ASHBY_API_KEY` first or source your env file in the shell.

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
ashby candidate create --name "Jane Doe" --email "jane@example.com" --linkedin-url "https://linkedin.com/in/jane" --json
ashby note create --candidate-id <candidate-id> --note "Strong fast-track candidate" --json
```

### Applications

```bash
ashby application list --job-id <job-id> --status Active --json
ashby application get <application-id> --json
ashby application create --candidate-id <candidate-id> --job-id <job-id> --interview-stage-id <stage-id> --json
ashby application stage-change --application-id <application-id> --interview-stage-id <stage-id> --json
```

### Pipeline metadata

```bash
ashby stage list --interview-plan-id <plan-id> --json
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

See `docs/CONTRACT_V1.md` for the stable CLI contract.
