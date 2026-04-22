import fs from "node:fs/promises";
import type { OfferFieldSubmission } from "./ashby-api.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateFieldSubmission(value: unknown): OfferFieldSubmission {
  if (!isObject(value)) {
    throw new Error("Each field submission must be a JSON object with `path` and `value`.");
  }

  if (typeof value.path !== "string" || !value.path.trim()) {
    throw new Error("Each field submission must include a non-empty string `path`.");
  }

  if (!Object.prototype.hasOwnProperty.call(value, "value")) {
    throw new Error("Each field submission must include a `value`.");
  }

  return {
    path: value.path.trim(),
    value: value.value,
  };
}

export function parseFieldSubmissionJson(input: string): OfferFieldSubmission {
  try {
    return validateFieldSubmission(JSON.parse(input));
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON passed to --field-json.");
    }
    throw error;
  }
}

export function parseFieldSubmissionsJson(input: string): OfferFieldSubmission[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Invalid JSON passed to --field-submissions-json.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("--field-submissions-json must be a non-empty JSON array.");
  }

  return parsed.map(validateFieldSubmission);
}

export async function readFieldSubmissionsFile(filePath: string): Promise<OfferFieldSubmission[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseFieldSubmissionsJson(raw);
}
