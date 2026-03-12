#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { saveAndValidateApiKey, validateApiKey } from "./auth.js";
import { AshbyApiClient, AshbyApiError } from "./ashby-api.js";
import { clearConfig, readConfig, redactApiKey, resolveApiKey } from "./config.js";
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
  else process.stderr.write("No API key. Use `ashby auth set --stdin` or export `ASHBY_API_KEY`.\n");
  process.exitCode = 2;
  return "";
}

function createClient(apiKey: string): AshbyApiClient {
  return new AshbyApiClient({ apiKey, userAgent: `ashby-cli/${getCliVersion()}` });
}

function printCandidatesHuman(items: any[]): void {
  for (const item of items) {
    const email = item.primaryEmailAddress?.value || "";
    console.log(`${item.id}\t${item.name}\t${email}`);
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
  .requiredOption("--name <name>", "Candidate name", undefined)
  .option("--email <email>", "Candidate email")
  .option("--json", "Emit JSON output")
  .action(async (opts: { name: string; email?: string; json?: boolean }) => {
    const apiKey = await requireApiKey(opts);
    if (!apiKey) return;
    await runAction(
      opts,
      async () => {
        const results = (await createClient(apiKey).candidateSearch({ name: opts.name, email: opts.email })).results || [];
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

program.parseAsync(process.argv);

