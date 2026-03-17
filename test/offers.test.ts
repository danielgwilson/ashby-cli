import { describe, expect, it } from "vitest";
import { parseFieldSubmissionJson, parseFieldSubmissionsJson } from "../src/offers.js";

describe("parseFieldSubmissionJson", () => {
  it("parses one field submission object", () => {
    expect(parseFieldSubmissionJson('{"path":"salary","value":{"currencyCode":"USD","value":100000}}')).toEqual({
      path: "salary",
      value: { currencyCode: "USD", value: 100000 },
    });
  });

  it("rejects invalid json", () => {
    expect(() => parseFieldSubmissionJson("{")).toThrow("Invalid JSON passed to --field-json.");
  });
});

describe("parseFieldSubmissionsJson", () => {
  it("parses a non-empty array of field submissions", () => {
    expect(parseFieldSubmissionsJson('[{"path":"startDate","value":"2026-04-01"}]')).toEqual([
      { path: "startDate", value: "2026-04-01" },
    ]);
  });

  it("rejects empty arrays", () => {
    expect(() => parseFieldSubmissionsJson("[]")).toThrow("--field-submissions-json must be a non-empty JSON array.");
  });
});
