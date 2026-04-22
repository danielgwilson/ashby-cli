#!/usr/bin/env node
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { stdin as input, stderr as output } from "node:process";
import { saveAndValidateApiKey, validateApiKey } from "./auth.js";
import { ASHBY_API_KEYS_URL, buildAuthSetupInstructions, openBrowser } from "./auth-setup.js";
import { AshbyApiClient, AshbyApiError } from "./ashby-api.js";
import { clearConfig, readConfig, redactApiKey, resolveApiKey } from "./config.js";
import { formatCandidateRow, validateCandidateSearchInput } from "./candidates.js";
import { buildApplicationFeed, formatFeedItem } from "./feed.js";
import { parseFieldSubmissionJson, parseFieldSubmissionsJson, readFieldSubmissionsFile } from "./offers.js";
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

function printJsonHuman(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printFeedHuman(items: Array<{ at: string; kind: string; title: string; detail?: string }>): void {
  for (const item of items) {
    console.log(formatFeedItem(item));
  }
}

function printOffersHuman(items: any[]): void {
  for (const item of items) {
    console.log(
      `${item.id || ""}\t${item.applicationId || ""}\t${item.offerStatus || ""}\t${item.acceptanceStatus || ""}\t${item.latestVersion?.approvalStatus || ""}`,
    );
  }
}

async function resolveOfferFieldSubmissions(opts: {
  fieldJson?: string[];
  fieldSubmissionsJson?: string;
  fieldSubmissionsFile?: string;
}): Promise<Array<{ path: string; value: unknown }>> {
  const submissions: Array<{ path: string; value: unknown }> = [];

  for (const value of opts.fieldJson || []) {
    submissions.push(parseFieldSubmissionJson(value));
  }

  if (opts.fieldSubmissionsJson) {
    submissions.push(...parseFieldSubmissionsJson(opts.fieldSubmissionsJson));
  }

  if (opts.fieldSubmissionsFile) {
    submissions.push(...(await readFieldSubmissionsFile(opts.fieldSubmissionsFile)));
  }

  if (submissions.length === 0) {
    throw new Error(
      "Provide offer fields with --field-json, --field-submissions-json, or --field-submissions-file.",
    );
  }

  return submissions;
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

const note = program.command("note").description("Candidate notes");

note
  .command("create")
  .description("Add a note to a candidate")
  .requiredOption("--candidate-id <candidate-id>", "Candidate id")
  .requiredOption("--note <note>", "Note content")
  .option("--json", "Emit JSON output")
  .action(async (opts: { candidateId: string; note: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => (await createClient(apiKey).candidateCreateNote(opts.candidateId, opts.note)).results, (value) => {
      console.log(JSON.stringify(value, null, 2));
    });
  });

const application = program.command("application").description("Application operations");

application
  .command("list")
  .description("List applications")
  .option("--job-id <job-id>", "Filter by job id")
  .option("--status <status>", "Active | Archived | Hired | Lead | All", "All")
  .option("--limit <limit>", "Max results", (value: string) => Number(value), 25)
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

const stage = program.command("stage").description("Interview stage metadata");
const interview = program.command("interview").description("Interview schedule and event operations");

stage
  .command("list")
  .description("List stages for an interview plan")
  .requiredOption("--interview-plan-id <interview-plan-id>", "Interview plan id")
  .option("--json", "Emit JSON output")
  .action(async (opts: { interviewPlanId: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => {
      const results = (await createClient(apiKey).interviewStageList(opts.interviewPlanId)).results || [];
      return { count: results.length, items: results };
    }, (value) => printStagesHuman(value.items));
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

const offer = program.command("offer").description("Offer operations");

offer
  .command("list")
  .description("List offers")
  .option("--application-id <application-id>", "Filter by application id")
  .option(
    "--offer-status <status>",
    "Filter by offer status, repeatable",
    (value: string, previous: string[] = []) => [...previous, value],
  )
  .option(
    "--acceptance-status <status>",
    "Filter by acceptance status, repeatable",
    (value: string, previous: string[] = []) => [...previous, value],
  )
  .option(
    "--approval-status <status>",
    "Filter by approval status, repeatable",
    (value: string, previous: string[] = []) => [...previous, value],
  )
  .option("--limit <limit>", "Max results", (value: string) => Number(value), 25)
  .option("--cursor <cursor>", "Pagination cursor")
  .option("--json", "Emit JSON output")
  .action(
    async (opts: {
      applicationId?: string;
      offerStatus?: string[];
      acceptanceStatus?: string[];
      approvalStatus?: string[];
      limit?: number;
      cursor?: string;
      json?: boolean;
    }) => {
      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(
        opts,
        async () => {
          const response = await createClient(apiKey).offerList({
            applicationId: opts.applicationId,
            offerStatus: opts.offerStatus as any,
            acceptanceStatus: opts.acceptanceStatus as any,
            approvalStatus: opts.approvalStatus as any,
            limit: opts.limit,
            cursor: opts.cursor,
          });
          const results = response.results || [];
          return {
            count: results.length,
            items: results,
            nextCursor: response.nextCursor,
            moreDataAvailable: response.moreDataAvailable,
          };
        },
        (value) => printOffersHuman(value.items),
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

offer
  .command("get")
  .description("Fetch one offer by id")
  .argument("<offer-id>", "Offer id")
  .option("--json", "Emit JSON output")
  .action(async (offerId: string, opts: CommonJsonOptions) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(opts, async () => (await createClient(apiKey).offerInfo(offerId)).results, (value) => {
      console.log(JSON.stringify(value, null, 2));
    });
  });

offer
  .command("create")
  .description("Create an offer")
  .requiredOption("--offer-process-id <offer-process-id>", "Offer process id")
  .requiredOption("--offer-form-id <offer-form-id>", "Offer form id")
  .option(
    "--field-json <json>",
    "Field submission JSON object, repeatable. Example: --field-json '{\"path\":\"salary\",\"value\":{\"currencyCode\":\"USD\",\"value\":100000}}'",
    (value: string, previous: string[] = []) => [...previous, value],
  )
  .option("--field-submissions-json <json>", "JSON array of field submissions")
  .option("--field-submissions-file <path>", "Path to a JSON file containing a field submissions array")
  .option("--json", "Emit JSON output")
  .action(
    async (opts: {
      offerProcessId: string;
      offerFormId: string;
      fieldJson?: string[];
      fieldSubmissionsJson?: string;
      fieldSubmissionsFile?: string;
      json?: boolean;
    }) => {
      let fieldSubmissions: Array<{ path: string; value: unknown }>;
      try {
        fieldSubmissions = await resolveOfferFieldSubmissions(opts);
      } catch (error: any) {
        const err = makeError(error, { code: "VALIDATION", message: error?.message || "Invalid offer form input." });
        if (opts.json) printJson(fail(err));
        else process.stderr.write(`${err.message}\n`);
        process.exitCode = 2;
        return;
      }

      const apiKey = await requireApiKey(opts);
      if (!apiKey) return;
      await runAction(
        opts,
        async () =>
          (
            await createClient(apiKey).offerCreate({
              offerProcessId: opts.offerProcessId,
              offerFormId: opts.offerFormId,
              offerForm: { fieldSubmissions },
            })
          ).results,
        (value) => {
          console.log(`${value?.id || ""}\t${value?.applicationId || ""}`);
        },
      );
    },
  );

program.parseAsync(process.argv);
