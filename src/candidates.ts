export type CandidateSearchInput = {
  name?: string;
  email?: string;
};

export type CandidateLike = {
  id?: string;
  name?: string;
  primaryEmailAddress?: {
    value?: string;
  };
};

export function validateCandidateSearchInput(input: CandidateSearchInput): CandidateSearchInput {
  const name = input.name?.trim();
  const email = input.email?.trim();

  if (!name && !email) {
    throw new Error("Provide at least one of --name or --email.");
  }

  return { name, email };
}

export function formatCandidateRow(candidate: CandidateLike): string {
  return `${candidate.id || ""}\t${candidate.name || ""}`;
}
