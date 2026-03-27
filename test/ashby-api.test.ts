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

  it("sends offer.create payload", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, results: { id: "offer_123" } }), { status: 200 }));
    const client = new AshbyApiClient({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.offerCreate({
      offerProcessId: "proc_123",
      offerFormId: "form_123",
      offerForm: {
        fieldSubmissions: [{ path: "startDate", value: "2026-04-01" }],
      },
    });

    expect(result.results).toEqual({ id: "offer_123" });
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0]!;
    expect(url).toBe("https://api.ashbyhq.com/offer.create");
    expect(JSON.parse(String(init.body))).toEqual({
      offerProcessId: "proc_123",
      offerFormId: "form_123",
      offerForm: {
        fieldSubmissions: [{ path: "startDate", value: "2026-04-01" }],
      },
    });
  });

  it("sends offer.list payload", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, results: [{ id: "offer_123" }], nextCursor: "cursor_2", moreDataAvailable: true }), {
        status: 200,
      }),
    );
    const client = new AshbyApiClient({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.offerList({
      applicationId: "app_123",
      offerStatus: ["WaitingOnCandidateResponse"],
      acceptanceStatus: ["Pending"],
      approvalStatus: ["WaitingOnApprovals"],
      limit: 10,
      cursor: "cursor_1",
    });

    expect(result.results).toEqual([{ id: "offer_123" }]);
    expect(result.nextCursor).toBe("cursor_2");
    expect(result.moreDataAvailable).toBe(true);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0]!;
    expect(url).toBe("https://api.ashbyhq.com/offer.list");
    expect(JSON.parse(String(init.body))).toEqual({
      applicationId: "app_123",
      offerStatus: ["WaitingOnCandidateResponse"],
      acceptanceStatus: ["Pending"],
      approvalStatus: ["WaitingOnApprovals"],
      limit: 10,
      cursor: "cursor_1",
    });
  });

  it("sends offer.info payload", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, results: { id: "offer_123" } }), { status: 200 }));
    const client = new AshbyApiClient({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.offerInfo("offer_123");

    expect(result.results).toEqual({ id: "offer_123" });
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0]!;
    expect(url).toBe("https://api.ashbyhq.com/offer.info");
    expect(JSON.parse(String(init.body))).toEqual({
      offerId: "offer_123",
    });
  });
});
