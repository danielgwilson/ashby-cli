import { describe, expect, it } from "vitest";
import { formatCandidateRow, validateCandidateSearchInput } from "../src/candidates.js";

describe("validateCandidateSearchInput", () => {
  it("accepts email-only lookup", () => {
    expect(validateCandidateSearchInput({ email: "jane@example.com" })).toEqual({
      email: "jane@example.com",
      name: undefined,
    });
  });

  it("rejects empty lookup", () => {
    expect(() => validateCandidateSearchInput({})).toThrow("Provide at least one of --name or --email.");
  });
});

describe("formatCandidateRow", () => {
  it("omits email from default human output", () => {
    expect(
      formatCandidateRow({
        id: "cand_123",
        name: "Jane Doe",
        primaryEmailAddress: { value: "jane@example.com" },
      }),
    ).toBe("cand_123\tJane Doe");
  });
});
