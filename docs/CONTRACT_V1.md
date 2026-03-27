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
- `candidate.createNote`
- `application.list`
- `application.info`
- `application.create`
- `application.changeStage`
- `interviewStage.list`
- `offer.list`
- `offer.info`
- `offer.create`

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

### `ashby offer create --offer-process-id <id> --offer-form-id <id> --field-json '{"path":"startDate","value":"2026-04-01"}' --json`

```json
{
  "ok": true,
  "data": {
    "id": "offer-uuid"
  }
}
```

### `ashby offer list --json`

```json
{
  "ok": true,
  "data": {
    "count": 1,
    "items": [
      {
        "id": "offer-uuid",
        "applicationId": "application-uuid",
        "acceptanceStatus": "Pending"
      }
    ],
    "nextCursor": "cursor-token",
    "moreDataAvailable": true
  }
}
```

### `ashby offer get <id> --json`

```json
{
  "ok": true,
  "data": {
    "id": "offer-uuid",
    "applicationId": "application-uuid"
  }
}
```
