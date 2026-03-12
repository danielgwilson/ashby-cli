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
});
