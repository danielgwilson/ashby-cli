import { describe, expect, it } from "vitest";
import { redactApiKey } from "../src/config.js";

describe("redactApiKey", () => {
  it("keeps only a small prefix and suffix", () => {
    expect(redactApiKey("abcd1234wxyz9876")).toBe("abcd…9876");
  });
});

