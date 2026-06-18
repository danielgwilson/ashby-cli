import { describe, expect, it, vi } from "vitest";
import { AshbyApiClient, AshbyApiError } from "../src/ashby-api.js";

describe("AshbyApiClient", () => {
  it("sends rpc request with basic auth", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, results: { ok: true } }), { status: 200 }));
    const client = new AshbyApiClient({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.candidateSearch({ name: "Jane Doe" });

    expect(result.results).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const call = calls[0];
    expect(call).toBeTruthy();
    const [url, init] = call!;
    expect(url).toBe("https://api.ashbyhq.com/candidate.search");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("secret-key:").toString("base64")}`);
  });

  it("throws AshbyApiError on non-2xx responses", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "nope" }] }), { status: 403, statusText: "Forbidden" }));
    const client = new AshbyApiClient({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.apiKeyInfo()).rejects.toBeInstanceOf(AshbyApiError);
  });

  it("updates candidates through candidate.update", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, results: { id: "cand_123" } }), { status: 200 }));
    const client = new AshbyApiClient({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.candidateUpdate({
      candidateId: "cand_123",
      phoneNumber: "+14155550123",
      linkedInUrl: "https://linkedin.com/in/jane",
      githubUrl: "https://github.com/jane",
      websiteUrl: "https://jane.dev",
      sendNotifications: false,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.ashbyhq.com/candidate.update");
    expect(JSON.parse(init.body as string)).toEqual({
      candidateId: "cand_123",
      phoneNumber: "+14155550123",
      linkedInUrl: "https://linkedin.com/in/jane",
      githubUrl: "https://github.com/jane",
      websiteUrl: "https://jane.dev",
      sendNotifications: false,
    });
  });

  it("fetches candidate info with the documented id field", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, results: { id: "cand_123" } }), { status: 200 }));
    const client = new AshbyApiClient({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.candidateInfo("cand_123");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.ashbyhq.com/candidate.info");
    expect(JSON.parse(init.body as string)).toEqual({ id: "cand_123" });
  });

  it("maps discovery helpers to official endpoints", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, results: [] }), { status: 200 }));
    const client = new AshbyApiClient({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.jobList({ status: ["Open"], limit: 50 });
    await client.jobInfo({ id: "job_123" });
    await client.interviewPlanList({ includeArchived: true });
    await client.sourceList(true);

    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url]) => url)).toEqual([
      "https://api.ashbyhq.com/job.list",
      "https://api.ashbyhq.com/job.info",
      "https://api.ashbyhq.com/interviewPlan.list",
      "https://api.ashbyhq.com/source.list",
    ]);
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({ status: ["Open"], limit: 50 });
    expect(JSON.parse(calls[3]![1].body as string)).toEqual({ includeArchived: true });
  });
});
