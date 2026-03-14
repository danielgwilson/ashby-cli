import { spawn } from "node:child_process";

export const ASHBY_API_KEYS_URL = "https://app.ashbyhq.com/admin/api/keys";

export const RECOMMENDED_PERMISSIONS = [
  "Jobs: read",
  "Candidates: read + write",
  "Interviews: read + write",
  "Hiring Process: read",
  "Offers: read + write",
  "API Keys: read",
];

export function buildAuthSetupInstructions(): string {
  return [
    "Ashby uses API keys, not OAuth.",
    `Open this page: ${ASHBY_API_KEYS_URL}`,
    "Create an API key with these permissions:",
    ...RECOMMENDED_PERMISSIONS.map((permission) => `- ${permission}`),
    "Optional toggles if you need them:",
    "- Allow access to confidential jobs and projects",
    "- Allow access to non-offer private fields",
    "Then paste the key here so ashby-cli can save and validate it.",
  ].join("\n");
}

export function getBrowserOpenCommand(url: string, platform = process.platform): { command: string; args: string[] } {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }

  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }

  return { command: "xdg-open", args: [url] };
}

export async function openBrowser(url: string, platform = process.platform): Promise<{ ok: boolean; command: string; error?: string }> {
  const { command, args } = getBrowserOpenCommand(url, platform);

  return await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });

    child.on("error", (error) => {
      resolve({ ok: false, command, error: error.message });
    });

    child.on("spawn", () => {
      resolve({ ok: true, command });
    });
  });
}
