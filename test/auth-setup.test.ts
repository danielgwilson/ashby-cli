import { describe, expect, it } from "vitest";
import { ASHBY_API_KEYS_URL, buildAuthSetupInstructions, getBrowserOpenCommand } from "../src/auth-setup.js";

describe("buildAuthSetupInstructions", () => {
  it("mentions API keys, the admin URL, and recommended permissions", () => {
    const value = buildAuthSetupInstructions();
    expect(value).toContain("Ashby uses API keys, not OAuth.");
    expect(value).toContain(ASHBY_API_KEYS_URL);
    expect(value).toContain("Jobs: read");
    expect(value).toContain("Candidates: read + write");
    expect(value).toContain("Offers: read + write");
  });
});

describe("getBrowserOpenCommand", () => {
  it("uses open on macOS", () => {
    expect(getBrowserOpenCommand("https://example.com", "darwin")).toEqual({
      command: "open",
      args: ["https://example.com"],
    });
  });

  it("uses cmd start on Windows", () => {
    expect(getBrowserOpenCommand("https://example.com", "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "https://example.com"],
    });
  });

  it("uses xdg-open on Linux", () => {
    expect(getBrowserOpenCommand("https://example.com", "linux")).toEqual({
      command: "xdg-open",
      args: ["https://example.com"],
    });
  });
});
