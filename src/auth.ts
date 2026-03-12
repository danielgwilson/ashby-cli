import { AshbyApiClient } from "./ashby-api.js";
import { saveApiKey } from "./config.js";

export type AuthValidation = {
  ok: boolean;
  reason?: string;
  sample?: {
    apiKeyId?: string;
  };
};

export async function validateApiKey(apiKey: string): Promise<AuthValidation> {
  const client = new AshbyApiClient({ apiKey });
  try {
    const info = await client.apiKeyInfo();
    const result = info.results as any;
    return {
      ok: true,
      sample: {
        apiKeyId: result?.id,
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      reason: error?.message || "Validation failed",
    };
  }
}

export async function saveAndValidateApiKey(apiKey: string): Promise<{ apiKey: string; validation: AuthValidation }> {
  const saved = await saveApiKey(apiKey);
  const validation = await validateApiKey(saved);
  return { apiKey: saved, validation };
}

