#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { stdin as input, stderr as output } from "node:process";
import { saveAndValidateApiKey, validateApiKey } from "./auth.js";
import { ASHBY_API_KEYS_URL, buildAuthSetupInstructions, openBrowser } from "./auth-setup.js";
import { AshbyApiClient, AshbyApiError } from "./ashby-api.js";
import { clearConfig, readConfig, redactApiKey, resolveApiKey } from "./config.js";
import { formatCandidateRow, validateCandidateSearchInput } from "./candidates.js";
import { buildApplicationFeed, formatFeedItem } from "./feed.js";
import { fail, makeError, ok, printJson } from "./output.js";

type CommonJsonOptions = { json?: boolean };

function getCliVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: unknown };
    return typeof pkg?.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readTextOption(opts: { text?: string; file?: string }, label: string): Promise<string> {
  if (opts.text && opts.file) {
    throw new Error(`Pass either --${label} or --${label}-file, not both.`);
  }
  if (opts.file) return readFile(opts.file, "utf8");
  if (opts.text) return opts.text;
  throw new Error(`Pass --${label} or --${label}-file.`);
}

function splitCsv(value?: string): string[] | undefined {
  const items = value?.split(",").map((item) => item.trim()).filter(Boolean);
  return items && items.length ? items : undefined;
}

async function requireApiKey({ json }: CommonJsonOptions): Promise<string> {
  const apiKey = await resolveApiKey();
  if (apiKey) return apiKey;

  const error = makeError(null, { code: "AUTH_MISSING", message: "No API key. Run `ashby auth set --stdin`." });
  if (json) printJson(fail(error));
  else process.stderr.write("No API key. Use `ashby auth setup`, `ashby auth set --stdin`, or export `ASHBY_API_KEY`.\n");
  process.exitCode = 2;
  return "";
}

function createClient(apiKey: string): AshbyApiClient {
  return new AshbyApiClient({ apiKey, userAgent: `ashby-cli/${getCliVersion()}` });
}

function printCandidatesHuman(items: any[]): void {
  for (const item of items) {
    console.log(formatCandidateRow(item));
  }
}

function printApplicationsHuman(items: any[]): void {
  for (const item of items) {
    const stage = item.currentInterviewStage?.title || "";
    console.log(`${item.id}\t${item.candidate?.name || ""}\t${stage}\t${item.status || ""}`);
  }
}

function printStagesHuman(items: any[]): void {
  for (const item of items) {
    console.log(`${item.id}\t${item.orderInInterviewPlan}\t${item.title}\t${item.type}`);
  }
}

function printJobsHuman(items: any[]): void {
  for (const item of items) {
    console.log(`${item.id}\t${item.title || ""}\t${item.status || ""}\t${item.defaultInterviewPlanId || ""}`);
  }
}

function printSourcesHuman(items: any[]): void {
  for (const item of items) {
    console.log(`${item.id}\t${item.title || item.name || ""}${item.isArchived ? "\tarchived" : ""}`);
  }
}

function printJsonHuman(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printFeedHuman(items: Array<{ at: string; kind: string; title: string; detail?: string }>): void {
  for (const item of items) {
    console.log(formatFeedItem(item));
  }
}

async function runAction<T>(
  opts: CommonJsonOptions,
  action: () => Promise<T>,
  human?: (value: T) => void,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const value = await action();
    if (opts.json) printJson(ok(value, meta));
    else if (human) human(value);
    else console.log(value);
  } catch (error: any) {
    const err = makeError(error instanceof AshbyApiError ? error : error);
    if (opts.json) printJson(fail(err, meta));
    else process.stderr.write(`${err.message}\n`);
    process.exitCode = err.code === "AUTH_MISSING" ? 2 : 1;
  }
}

const program = new Command();

program.name("ashby").description("Agent-first CLI for Ashby's official API").version(getCliVersion());

const auth = program.command("auth").description("Manage API key auth");

auth
  .command("setup")
  .description("Open the Ashby API key page and save a pasted API key")
  .option("--stdin", "Read the API key from stdin instead of prompting")
  .option("--no-open", "Do not open the Ashby admin page in a browser")
  .option("--open-only", "Only open the Ashby admin page and print setup guidance")
  .option("--json", "Emit JSON output")
  .action(async (opts: { stdin?: boolean; open?: boolean; openOnly?: boolean; json?: boolean }) => {
    const resolved = await resolveApiKey();
    const existingValidation = resolved ? await validateApiKey(resolved) : undefined;

    const instructions = buildAuthSetupInstructions();
    const browser =
      opts.open === false
        ? { attempted: false, ok: false as const, command: null as string | null, error: undefined as string | undefined }
        : await openBrowser(ASHBY_API_KEYS_URL);
    const browserMeta = {
      attempted: opts.open !== false,
      ok: browser.ok,
      command: browser.command,
      url: ASHBY_API_KEYS_URL,
      error: browser.ok ? undefined : browser.error,
    };

    if (opts.openOnly) {
      if (opts.json) {
        printJson(
          ok({
            alreadyConfigured: Boolean(resolved),
            existingValidation,
            browser: browserMeta,
            instructions,
          }),
        );
      } else {
        process.stderr.write(`${instructions}\n`);
      }
      return;
    }

    let apiKey = "";
    if (opts.stdin) {
      apiKey = await readStdin();
    } else if (input.isTTY) {
      const rl = createInterface({ input, output });
      process.stderr.write(`${instructions}\n`);
      apiKey = await rl.question("Paste Ashby API key: ");
      rl.close();
    } else {
      const error = makeError(null, {
        code: "AUTH_MISSING",
        message: "No interactive terminal. Run `ashby auth setup --stdin`, `ashby auth set --stdin`, or export `ASHBY_API_KEY`.",
      });
      if (opts.json) {
        printJson(fail(error, { browser: browserMeta, instructions }));
      } else {
        process.stderr.write(`${instructions}\n${error.message}\n`);
      }
      process.exitCode = 2;
      return;
    }

    if (!apiKey.trim()) {
      const error = makeError(null, { code: "VALIDATION", message: "No API key provided." });
      if (opts.json) printJson(fail(error, { browser: browserMeta }));
      else process.stderr.write("No API key provided.\n");
      process.exitCode = 2;
      return;
    }

    const result = await saveAndValidateApiKey(apiKey);
    const payload = {
      apiKeyRedacted: redactApiKey(result.apiKey),
      validation: result.validation,
      browser: browserMeta,
    };
    if (opts.json) printJson(ok(payload));
    else console.log(`Saved API key ${payload.apiKeyRedacted}`);
  });

auth
  .command("set")
  .description("Store an Ashby API key from stdin")
  .option("--stdin", "Read the API key from stdin")
  .option("--json", "Emit JSON output")
  .action(async (opts: { stdin?: boolean; json?: boolean }) => {
    const apiKey = opts.stdin ? await readStdin() : "";
    if (!apiKey.trim()) {
      const error = makeError(null, { code: "VALIDATION", message: "No API key provided on stdin." });
      if (opts.json) printJson(fail(error));
      else process.stderr.write("No API key provided on stdin.\n");
      process.exitCode = 2;
      return;
    }

    const result = await saveAndValidateApiKey(apiKey);
    const payload = {
      apiKeyRedacted: redactApiKey(result.apiKey),
      validation: result.validation,
    };
    if (opts.json) printJson(ok(payload));
    else console.log(`Saved API key ${payload.apiKeyRedacted}`);
  });

auth
  .command("status")
  .description("Check API key status")
  .option("--json", "Emit JSON output")
  .action(async (opts: CommonJsonOptions) => {
    const envApiKey = process.env.ASHBY_API_KEY?.trim();
    const config = await readConfig();
    const apiKey = envApiKey || config?.apiKey || "";
    const source = envApiKey ? "env:ASHBY_API_KEY" : config?.apiKey ? "config" : null;
    const validation = apiKey ? await validateApiKey(apiKey) : undefined;
    const payload = {
      hasApiKey: Boolean(apiKey),
      source,
      apiKeyRedacted: apiKey ? redactApiKey(apiKey) : null,
      validation,
    };
    if (opts.json) printJson(ok(payload));
    else console.log(payload.hasApiKey ? `${payload.apiKeyRedacted} (${payload.source})` : "No API key configured");
  });

auth
  .command("clear")
  .description("Delete saved local auth config")
  .option("--json", "Emit JSON output")
  .action(async (opts: CommonJsonOptions) => {
    await clearConfig();
    if (opts.json) printJson(ok({ cleared: true }));
    else console.log("Cleared saved config");
  });

program
  .command("doctor")
  .description("Run basic health checks")
  .option("--json", "Emit JSON output")
  .action(async (opts: CommonJsonOptions) => {
    const apiKey = await resolveApiKey();
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = [{ name: "auth.present", ok: Boolean(apiKey) }];
    if (apiKey) {
      try {
        await createClient(apiKey).apiKeyInfo();
        checks.push({ name: "api.apiKey.info", ok: true });
      } catch (error: any) {
        checks.push({ name: "api.apiKey.info", ok: false, detail: error?.message || "Request failed" });
      }
    }
    const failed = checks.some((check) => !check.ok);
    if (opts.json) {
      if (failed) {
        printJson(fail(makeError(null, { code: "CHECK_FAILED", message: "One or more checks failed" }), { checks }));
      } else {
        printJson(ok({ checks }));
      }
      return;
    }
    for (const check of checks) console.log(`${check.ok ? "ok" : "fail"}\t${check.name}${check.detail ? `\t${check.detail}` : ""}`);
    process.exitCode = failed ? 1 : 0;
  });

program
  .command("whoami")
  .description("Inspect the current API key identity")
  .option("--json", "Emit JSON output")
  .action(async (opts: CommonJsonOptions) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => (await createClient(apiKey).apiKeyInfo()).results, (value) => {
      console.log(JSON.stringify(value, null, 2));
    });
  });

const candidate = program.command("candidate").description("Candidate operations");

candidate
  .command("search")
  .description("Search candidates by name or email")
  .option("--name <name>", "Candidate name")
  .option("--email <email>", "Candidate email")
  .option("--json", "Emit JSON output")
  .action(async (opts: { name: string; email?: string; json?: boolean }) => {
    let input: { name?: string; email?: string };
    try {
      input = validateCandidateSearchInput({ name: opts.name, email: opts.email });
    } catch (error: any) {
      const err = makeError(error, { code: "VALIDATION", message: error?.message || "Invalid candidate search input." });
      if (opts.json) printJson(fail(err));
      else process.stderr.write(`${err.message}\n`);
      process.exitCode = 2;
      return;
    }

    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const results = (await createClient(apiKey).candidateSearch(input)).results || [];
        return { count: results.length, items: results };
      },
      (value) => printCandidatesHuman(value.items),
    );
  });

candidate
  .command("get")
  .description("Fetch one candidate by id")
  .argument("<candidate-id>", "Candidate id")
  .option("--json", "Emit JSON output")
  .action(async (candidateId: string, opts: CommonJsonOptions) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => (await createClient(apiKey).candidateInfo(candidateId)).results, (value) => {
      console.log(JSON.stringify(value, null, 2));
    });
  });

candidate
  .command("notes")
  .description("List notes for a candidate")
  .requiredOption("--candidate-id <candidate-id>", "Candidate id")
  .option("--cursor <cursor>", "Pagination cursor")
  .option("--json", "Emit JSON output")
  .action(async (opts: { candidateId: string; cursor?: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const response = await createClient(apiKey).candidateListNotes(opts.candidateId, opts.cursor);
        return {
          count: (response.results || []).length,
          items: response.results || [],
          nextCursor: response.nextCursor,
          moreDataAvailable: response.moreDataAvailable || false,
        };
      },
      (value) => printJsonHuman(value.items),
    );
  });

candidate
  .command("create")
  .description("Create a candidate")
  .requiredOption("--name <name>", "Candidate full name")
  .option("--email <email>", "Primary email")
  .option("--phone-number <phone>", "Phone number")
  .option("--linkedin-url <url>", "LinkedIn URL")
  .option("--github-url <url>", "GitHub URL")
  .option("--website <url>", "Website URL")
  .option("--json", "Emit JSON output")
  .action(
    async (
      opts: {
        name: string;
        email?: string;
        phoneNumber?: string;
        linkedinUrl?: string;
        githubUrl?: string;
        website?: string;
        json?: boolean;
      },
    ) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(opts, async () => (await createClient(apiKey).candidateCreate({
        name: opts.name,
        email: opts.email,
        phoneNumber: opts.phoneNumber,
        linkedInUrl: opts.linkedinUrl,
        githubUrl: opts.githubUrl,
        website: opts.website,
      })).results, (value) => {
        console.log(`${value?.id}\t${value?.name || opts.name}`);
      });
    },
  );

candidate
  .command("update")
  .description("Update an existing candidate")
  .requiredOption("--candidate-id <candidate-id>", "Candidate id")
  .option("--name <name>", "Candidate full name")
  .option("--email <email>", "Primary email")
  .option("--phone-number <phone>", "Phone number")
  .option("--linkedin-url <url>", "LinkedIn URL")
  .option("--github-url <url>", "GitHub URL")
  .option("--website-url <url>", "Website URL")
  .option("--alternate-email <email>", "Alternate email address to add")
  .option("--source-id <source-id>", "Candidate source id")
  .option("--credited-to-user-id <user-id>", "Credited user id")
  .option("--location-city <city>", "Candidate location city")
  .option("--location-region <region>", "Candidate location region/state")
  .option("--location-country <country>", "Candidate location country")
  .option("--send-notifications", "Notify subscribed users")
  .option("--suppress-notifications", "Do not notify subscribed users")
  .option("--json", "Emit JSON output")
  .action(
    async (
      opts: {
        candidateId: string;
        name?: string;
        email?: string;
        phoneNumber?: string;
        linkedinUrl?: string;
        githubUrl?: string;
        websiteUrl?: string;
        alternateEmail?: string;
        sourceId?: string;
        creditedToUserId?: string;
        locationCity?: string;
        locationRegion?: string;
        locationCountry?: string;
        sendNotifications?: boolean;
        suppressNotifications?: boolean;
        json?: boolean;
      },
    ) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      const location =
        opts.locationCity || opts.locationRegion || opts.locationCountry
          ? { city: opts.locationCity, region: opts.locationRegion, country: opts.locationCountry }
          : undefined;
      await runAction(opts, async () => (await createClient(apiKey).candidateUpdate({
        candidateId: opts.candidateId,
        name: opts.name,
        email: opts.email,
        phoneNumber: opts.phoneNumber,
        linkedInUrl: opts.linkedinUrl,
        githubUrl: opts.githubUrl,
        websiteUrl: opts.websiteUrl,
        alternateEmail: opts.alternateEmail,
        sourceId: opts.sourceId,
        creditedToUserId: opts.creditedToUserId,
        sendNotifications: opts.suppressNotifications ? false : opts.sendNotifications,
        location,
      })).results, (value) => {
        console.log(`${value?.id || opts.candidateId}\t${value?.name || ""}`);
      });
    },
  );

candidate
  .command("upsert")
  .description("Create or update one candidate by email")
  .requiredOption("--name <name>", "Candidate full name")
  .requiredOption("--email <email>", "Primary email used for lookup")
  .option("--phone-number <phone>", "Phone number")
  .option("--linkedin-url <url>", "LinkedIn URL")
  .option("--github-url <url>", "GitHub URL")
  .option("--website-url <url>", "Website URL")
  .option("--source-id <source-id>", "Candidate source id")
  .option("--credited-to-user-id <user-id>", "Credited user id")
  .option("--send-notifications", "Notify subscribed users when updating")
  .option("--suppress-notifications", "Do not notify subscribed users when updating")
  .option("--json", "Emit JSON output")
  .action(
    async (
      opts: {
        name: string;
        email: string;
        phoneNumber?: string;
        linkedinUrl?: string;
        githubUrl?: string;
        websiteUrl?: string;
        sourceId?: string;
        creditedToUserId?: string;
        sendNotifications?: boolean;
        suppressNotifications?: boolean;
        json?: boolean;
      },
    ) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(
        opts,
        async () => {
          const client = createClient(apiKey);
          const matches = (await client.candidateSearch({ email: opts.email })).results || [];
          if (matches.length > 1) {
            throw new Error(`Candidate email lookup returned ${matches.length} matches; update manually.`);
          }
          if (matches.length === 1) {
            const candidateId = matches[0]?.id as string;
            const updated = (await client.candidateUpdate({
              candidateId,
              name: opts.name,
              email: opts.email,
              phoneNumber: opts.phoneNumber,
              linkedInUrl: opts.linkedinUrl,
              githubUrl: opts.githubUrl,
              websiteUrl: opts.websiteUrl,
              sourceId: opts.sourceId,
              creditedToUserId: opts.creditedToUserId,
              sendNotifications: opts.suppressNotifications ? false : opts.sendNotifications,
            })).results;
            return { action: "updated", candidate: updated };
          }
          const created = (await client.candidateCreate({
            name: opts.name,
            email: opts.email,
            phoneNumber: opts.phoneNumber,
            linkedInUrl: opts.linkedinUrl,
            githubUrl: opts.githubUrl,
            website: opts.websiteUrl,
            sourceId: opts.sourceId,
            creditedToUserId: opts.creditedToUserId,
          })).results;
          return { action: "created", candidate: created };
        },
        (value) => {
          console.log(`${value.action}\t${value.candidate?.id || ""}\t${value.candidate?.name || opts.name}`);
        },
      );
    },
  );

const note = program.command("note").description("Candidate notes");

note
  .command("create")
  .description("Add a note to a candidate")
  .requiredOption("--candidate-id <candidate-id>", "Candidate id")
  .option("--note <note>", "Note content")
  .option("--note-file <path>", "Read note content from a file")
  .option("--json", "Emit JSON output")
  .action(async (opts: { candidateId: string; note?: string; noteFile?: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    let noteText = "";
    try {
      noteText = await readTextOption({ text: opts.note, file: opts.noteFile }, "note");
    } catch (error: any) {
      const err = makeError(error, { code: "VALIDATION", message: error?.message || "Invalid note input." });
      if (opts.json) printJson(fail(err));
      else process.stderr.write(`${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    await runAction(opts, async () => (await createClient(apiKey).candidateCreateNote(opts.candidateId, noteText)).results, (value) => {
      console.log(JSON.stringify(value, null, 2));
    });
  });

note
  .command("ensure")
  .description("Add a candidate note only when no existing note contains the marker")
  .requiredOption("--candidate-id <candidate-id>", "Candidate id")
  .requiredOption("--marker <marker>", "Idempotency marker to search for in existing notes")
  .option("--note <note>", "Note content")
  .option("--note-file <path>", "Read note content from a file")
  .option("--json", "Emit JSON output")
  .action(async (opts: { candidateId: string; marker: string; note?: string; noteFile?: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    let noteText = "";
    try {
      noteText = await readTextOption({ text: opts.note, file: opts.noteFile }, "note");
    } catch (error: any) {
      const err = makeError(error, { code: "VALIDATION", message: error?.message || "Invalid note input." });
      if (opts.json) printJson(fail(err));
      else process.stderr.write(`${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    await runAction(
      opts,
      async () => {
        const client = createClient(apiKey);
        const notes = (await client.candidateListNotes(opts.candidateId)).results || [];
        const exists = notes.some((note) => String(note.note || note.content || note.text || "").includes(opts.marker));
        if (exists) return { action: "skipped", marker: opts.marker, candidateId: opts.candidateId };
        const created = (await client.candidateCreateNote(opts.candidateId, noteText)).results;
        return { action: "created", marker: opts.marker, candidateId: opts.candidateId, note: created };
      },
      (value) => {
        console.log(`${value.action}\t${value.candidateId}\t${value.marker}`);
      },
    );
  });

const application = program.command("application").description("Application operations");

application
  .command("list")
  .description("List applications")
  .option("--job-id <job-id>", "Filter by job id")
  .option("--status <status>", "Active | Archived | Hired | Lead | All", "All")
  .option("--limit <limit>", "Max results", (value) => Number(value), 25)
  .option("--cursor <cursor>", "Pagination cursor")
  .option("--json", "Emit JSON output")
  .action(
    async (opts: { jobId?: string; status?: "Active" | "Archived" | "Hired" | "Lead" | "All"; limit?: number; cursor?: string; json?: boolean }) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(
        opts,
        async () => {
          const results = (await createClient(apiKey).applicationList({
            jobId: opts.jobId,
            status: opts.status,
            limit: opts.limit,
            cursor: opts.cursor,
          })).results || [];
          return { count: results.length, items: results };
        },
        (value) => printApplicationsHuman(value.items),
      );
    },
  );

application
  .command("get")
  .description("Fetch one application by id")
  .argument("<application-id>", "Application id")
  .option("--json", "Emit JSON output")
  .action(async (applicationId: string, opts: CommonJsonOptions) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => (await createClient(apiKey).applicationInfo(applicationId)).results, (value) => {
      console.log(JSON.stringify(value, null, 2));
    });
  });

application
  .command("history")
  .description("List application stage/history entries")
  .requiredOption("--application-id <application-id>", "Application id")
  .option("--json", "Emit JSON output")
  .action(async (opts: { applicationId: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const response = await createClient(apiKey).applicationListHistory(opts.applicationId);
        return {
          count: (response.results || []).length,
          items: response.results || [],
          moreDataAvailable: response.moreDataAvailable || false,
          nextCursor: response.nextCursor,
        };
      },
      (value) => printJsonHuman(value.items),
    );
  });

application
  .command("feedback")
  .description("List application feedback")
  .requiredOption("--application-id <application-id>", "Application id")
  .option("--json", "Emit JSON output")
  .action(async (opts: { applicationId: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const response = await createClient(apiKey).applicationFeedbackList(opts.applicationId);
        return {
          count: (response.results || []).length,
          items: response.results || [],
          moreDataAvailable: response.moreDataAvailable || false,
          nextCursor: response.nextCursor,
        };
      },
      (value) => printJsonHuman(value.items),
    );
  });

application
  .command("feed")
  .description("Build a synthetic application feed from public API surfaces")
  .requiredOption("--application-id <application-id>", "Application id")
  .option("--no-notes", "Do not include candidate notes")
  .option("--json", "Emit JSON output")
  .action(async (opts: { applicationId: string; notes?: boolean; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const client = createClient(apiKey);
        const app = await client.applicationInfo(opts.applicationId);
        const candidateId = app.results?.candidate?.id as string | undefined;

        const [historyResponse, feedbackResponse, scheduleResponse] = await Promise.all([
          client.applicationListHistory(opts.applicationId),
          client.applicationFeedbackList(opts.applicationId),
          client.interviewScheduleList({ applicationId: opts.applicationId }),
        ]);

        const notesResponse =
          opts.notes === false || !candidateId ? { results: [], moreDataAvailable: false } : await client.candidateListNotes(candidateId);

        const feed = buildApplicationFeed({
          history: historyResponse.results || app.results?.applicationHistory || [],
          notes: notesResponse.results || [],
          feedback: feedbackResponse.results || [],
          schedules: scheduleResponse.results || [],
        });

        return {
          applicationId: opts.applicationId,
          candidateId: candidateId || null,
          count: feed.length,
          items: feed,
        };
      },
      (value) => printFeedHuman(value.items),
    );
  });

application
  .command("create")
  .description("Create an application for a candidate")
  .requiredOption("--candidate-id <candidate-id>", "Candidate id")
  .requiredOption("--job-id <job-id>", "Job id")
  .option("--interview-plan-id <interview-plan-id>", "Interview plan id")
  .option("--interview-stage-id <interview-stage-id>", "Interview stage id")
  .option("--source-id <source-id>", "Source id")
  .option("--credited-to-user-id <user-id>", "Credited user id")
  .option("--json", "Emit JSON output")
  .action(
    async (
      opts: {
        candidateId: string;
        jobId: string;
        interviewPlanId?: string;
        interviewStageId?: string;
        sourceId?: string;
        creditedToUserId?: string;
        json?: boolean;
      },
    ) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(opts, async () => (await createClient(apiKey).applicationCreate({
        candidateId: opts.candidateId,
        jobId: opts.jobId,
        interviewPlanId: opts.interviewPlanId,
        interviewStageId: opts.interviewStageId,
        sourceId: opts.sourceId,
        creditedToUserId: opts.creditedToUserId,
      })).results, (value) => {
        console.log(`${value?.id}\t${value?.status || ""}`);
      });
    },
  );

application
  .command("stage-change")
  .description("Move an application to a new stage")
  .requiredOption("--application-id <application-id>", "Application id")
  .requiredOption("--interview-stage-id <interview-stage-id>", "Target interview stage id")
  .option("--archive-reason-id <archive-reason-id>", "Archive reason id")
  .option("--json", "Emit JSON output")
  .action(async (opts: { applicationId: string; interviewStageId: string; archiveReasonId?: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => (await createClient(apiKey).applicationChangeStage({
      applicationId: opts.applicationId,
      interviewStageId: opts.interviewStageId,
      archiveReasonId: opts.archiveReasonId,
    })).results, (value) => {
      console.log(`${value?.id}\t${value?.currentInterviewStage?.title || ""}`);
    });
  });

const job = program.command("job").description("Job metadata");

job
  .command("list")
  .description("List jobs")
  .option("--status <statuses>", "Comma-separated statuses, e.g. Open,Draft,Closed")
  .option("--limit <limit>", "Max results", (value) => Number(value), 100)
  .option("--cursor <cursor>", "Pagination cursor")
  .option("--include-unpublished-job-postings-ids", "Include unpublished job posting ids")
  .option("--expand <expand>", "Comma-separated expand values")
  .option("--json", "Emit JSON output")
  .action(
    async (
      opts: {
        status?: string;
        limit?: number;
        cursor?: string;
        includeUnpublishedJobPostingsIds?: boolean;
        expand?: string;
        json?: boolean;
      },
    ) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(
        opts,
        async () => {
          const response = await createClient(apiKey).jobList({
            status: splitCsv(opts.status),
            limit: opts.limit,
            cursor: opts.cursor,
            includeUnpublishedJobPostingsIds: opts.includeUnpublishedJobPostingsIds,
            expand: splitCsv(opts.expand),
          });
          return {
            count: (response.results || []).length,
            items: response.results || [],
            nextCursor: response.nextCursor,
            moreDataAvailable: response.moreDataAvailable || false,
          };
        },
        (value) => printJobsHuman(value.items),
      );
    },
  );

job
  .command("get")
  .description("Fetch one job by id")
  .argument("<job-id>", "Job id")
  .option("--include-unpublished-job-postings-ids", "Include unpublished job posting ids")
  .option("--expand <expand>", "Comma-separated expand values")
  .option("--json", "Emit JSON output")
  .action(async (jobId: string, opts: { includeUnpublishedJobPostingsIds?: boolean; expand?: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => (await createClient(apiKey).jobInfo({
      id: jobId,
      includeUnpublishedJobPostingsIds: opts.includeUnpublishedJobPostingsIds,
      expand: splitCsv(opts.expand),
    })).results, (value) => {
      console.log(JSON.stringify(value, null, 2));
    });
  });

job
  .command("search")
  .description("Search jobs by title using job.list results")
  .requiredOption("--title <title>", "Title substring")
  .option("--status <statuses>", "Comma-separated statuses, e.g. Open,Draft,Closed")
  .option("--limit <limit>", "Max results to fetch before filtering", (value) => Number(value), 100)
  .option("--json", "Emit JSON output")
  .action(async (opts: { title: string; status?: string; limit?: number; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const results = (await createClient(apiKey).jobList({
          status: splitCsv(opts.status),
          limit: opts.limit,
        })).results || [];
        const needle = opts.title.toLowerCase();
        const items = results.filter((item) => String(item.title || "").toLowerCase().includes(needle));
        return { count: items.length, items, derivedFrom: "job.list" };
      },
      (value) => printJobsHuman(value.items),
    );
  });

const stage = program.command("stage").description("Interview stage metadata");
const interview = program.command("interview").description("Interview schedule and event operations");
const interviewPlan = program.command("interview-plan").description("Interview plan metadata");
const source = program.command("source").description("Candidate/application source metadata");

stage
  .command("list")
  .description("List stages for an interview plan or a job's default interview plan")
  .option("--interview-plan-id <interview-plan-id>", "Interview plan id")
  .option("--job-id <job-id>", "Resolve the job's defaultInterviewPlanId first")
  .option("--json", "Emit JSON output")
  .action(async (opts: { interviewPlanId?: string; jobId?: string; json?: boolean }) => {
    if ((opts.interviewPlanId ? 1 : 0) + (opts.jobId ? 1 : 0) !== 1) {
      const err = makeError(null, { code: "VALIDATION", message: "Pass exactly one of --interview-plan-id or --job-id." });
      if (opts.json) printJson(fail(err));
      else process.stderr.write(`${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => {
      const client = createClient(apiKey);
      const jobInfo = opts.jobId ? (await client.jobInfo({ id: opts.jobId })).results : null;
      const interviewPlanId = opts.interviewPlanId || jobInfo?.defaultInterviewPlanId;
      if (!interviewPlanId) throw new Error(`Could not resolve interview plan for job ${opts.jobId}.`);
      const results = (await client.interviewStageList(interviewPlanId)).results || [];
      return { count: results.length, items: results, interviewPlanId, jobId: opts.jobId || null };
    }, (value) => printStagesHuman(value.items));
  });

interviewPlan
  .command("list")
  .description("List interview plans")
  .option("--include-archived", "Include archived interview plans")
  .option("--limit <limit>", "Max results", (value) => Number(value), 100)
  .option("--cursor <cursor>", "Pagination cursor")
  .option("--json", "Emit JSON output")
  .action(async (opts: { includeArchived?: boolean; limit?: number; cursor?: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const response = await createClient(apiKey).interviewPlanList({
          includeArchived: opts.includeArchived,
          limit: opts.limit,
          cursor: opts.cursor,
        });
        return {
          count: (response.results || []).length,
          items: response.results || [],
          nextCursor: response.nextCursor,
          moreDataAvailable: response.moreDataAvailable || false,
        };
      },
      (value) => printJsonHuman(value.items),
    );
  });

source
  .command("list")
  .description("List candidate/application sources")
  .option("--include-archived", "Include archived sources")
  .option("--json", "Emit JSON output")
  .action(async (opts: { includeArchived?: boolean; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const results = (await createClient(apiKey).sourceList(Boolean(opts.includeArchived))).results || [];
        return { count: results.length, items: results };
      },
      (value) => printSourcesHuman(value.items),
    );
  });

interview
  .command("schedules")
  .description("List interview schedules")
  .option("--application-id <application-id>", "Filter by application id")
  .option("--interview-schedule-id <interview-schedule-id>", "Filter by interview schedule id")
  .option("--interview-id <interview-id>", "Filter by interview id")
  .option("--cursor <cursor>", "Pagination cursor")
  .option("--json", "Emit JSON output")
  .action(
    async (opts: { applicationId?: string; interviewScheduleId?: string; interviewId?: string; cursor?: string; json?: boolean }) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(
        opts,
        async () => {
          const response = await createClient(apiKey).interviewScheduleList({
            applicationId: opts.applicationId,
            interviewScheduleId: opts.interviewScheduleId,
            interviewId: opts.interviewId,
            cursor: opts.cursor,
          });
          return {
            count: (response.results || []).length,
            items: response.results || [],
            moreDataAvailable: response.moreDataAvailable || false,
            nextCursor: response.nextCursor,
          };
        },
        (value) => printJsonHuman(value.items),
      );
    },
  );

interview
  .command("events")
  .description("List interview events")
  .option("--application-id <application-id>", "Filter by application id")
  .option("--interview-schedule-id <interview-schedule-id>", "Filter by interview schedule id")
  .option("--interview-id <interview-id>", "Filter by interview id")
  .option("--cursor <cursor>", "Pagination cursor")
  .option("--json", "Emit JSON output")
  .action(
    async (opts: { applicationId?: string; interviewScheduleId?: string; interviewId?: string; cursor?: string; json?: boolean }) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(
        opts,
        async () => {
          const response = await createClient(apiKey).interviewEventList({
            applicationId: opts.applicationId,
            interviewScheduleId: opts.interviewScheduleId,
            interviewId: opts.interviewId,
            cursor: opts.cursor,
          });
          return {
            count: (response.results || []).length,
            items: response.results || [],
            moreDataAvailable: response.moreDataAvailable || false,
            nextCursor: response.nextCursor,
          };
        },
        (value) => printJsonHuman(value.items),
      );
    },
  );

program.parseAsync(process.argv);
