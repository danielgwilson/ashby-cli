# Ashby CLI v1 contract (agent-first)

This document defines stable machine-readable behavior for the official-API-first Ashby CLI.

## Output rules

- When you pass `--json`, the command prints exactly one JSON object to stdout.
- Progress and status logs go to stderr.
- Mutation commands strongly prefer JSON output even without `--json`.

## JSON envelope

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_MISSING",
    "message": "No API key. Run `ashby auth set --stdin`.",
    "retryable": false,
    "http": { "status": 401 }
  },
  "meta": {}
}
```

## Exit codes

- `0`: success
- `1`: upstream failure, request failure, or not found
- `2`: user action required or invalid input

## Error codes

- `AUTH_MISSING`
- `AUTH_INVALID`
- `NOT_FOUND`
- `RATE_LIMITED`
- `UPSTREAM_5XX`
- `TIMEOUT`
- `VALIDATION`
- `CHECK_FAILED`
- `UNKNOWN`

## V1 coverage boundary

Direct official API coverage:

- `apiKey.info`
- `candidate.search`
- `candidate.info`
- `candidate.create`
- `candidate.update`
- `candidate.createNote`
- `candidate.listNotes`
- `application.list`
- `application.info`
- `application.listHistory`
- `applicationFeedback.list`
- `application.create`
- `application.changeStage`
- `interviewStage.list`
- `interviewSchedule.list`
- `interviewEvent.list`
- `job.list`
- `job.info`
- `interviewPlan.list`
- `source.list`

Derived official-API helpers:

- `candidate.upsert`: uses `candidate.search` by email, then `candidate.update` or `candidate.create`
- `note.ensure`: uses `candidate.listNotes`, then `candidate.createNote` only when the marker is absent
- `job.search`: uses `job.list`, then filters by title substring locally
- `stage list --job-id`: uses `job.info`, then `interviewStage.list` for the job's `defaultInterviewPlanId`

## Command examples

### `ashby auth status --json`

```json
{
  "ok": true,
  "data": {
    "hasApiKey": true,
    "source": "env:ASHBY_API_KEY",
    "apiKeyRedacted": "abcd…1234",
    "validation": { "ok": true }
  }
}
```

### `ashby doctor --json`

```json
{
  "ok": true,
  "data": {
    "checks": [
      { "name": "auth.present", "ok": true },
      { "name": "api.apiKey.info", "ok": true }
    ]
  }
}
```

### `ashby candidate search --name "Jane Doe" --json`

```json
{
  "ok": true,
  "data": {
    "count": 1,
    "items": [
      {
        "id": "uuid",
        "name": "Jane Doe"
      }
    ]
  }
}
```

### `ashby application create --candidate-id <id> --job-id <id> --json`

```json
{
  "ok": true,
  "data": {
    "id": "application-uuid",
    "status": "Active"
  }
}
```

### `ashby candidate upsert --name "Jane Doe" --email "jane@example.com" --json`

```json
{
  "ok": true,
  "data": {
    "action": "updated",
    "candidate": {
      "id": "uuid",
      "name": "Jane Doe"
    }
  }
}
```

### `ashby note ensure --candidate-id <id> --marker "AHH 2026" --note-file ./note.txt --json`

```json
{
  "ok": true,
  "data": {
    "action": "skipped",
    "marker": "AHH 2026",
    "candidateId": "uuid"
  }
}
```

### `ashby stage list --job-id <job-id> --json`

```json
{
  "ok": true,
  "data": {
    "count": 3,
    "items": [],
    "interviewPlanId": "uuid",
    "jobId": "uuid"
  }
}
```
