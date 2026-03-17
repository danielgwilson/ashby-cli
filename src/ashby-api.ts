const BASE_URL = "https://api.ashbyhq.com";

export type AshbyResponse<T> = {
  success: boolean;
  results?: T;
  errors?: Array<{ message: string }>;
  moreDataAvailable?: boolean;
  nextCursor?: string;
};

export type CandidateSearchParams = {
  name?: string;
  email?: string;
};

export type CandidateCreateInput = {
  name: string;
  email?: string;
  phoneNumber?: string;
  linkedInUrl?: string;
  githubUrl?: string;
  website?: string;
  alternateEmailAddresses?: string[];
  sourceId?: string;
  creditedToUserId?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
};

export type ApplicationCreateInput = {
  candidateId: string;
  jobId: string;
  interviewPlanId?: string;
  interviewStageId?: string;
  sourceId?: string;
  creditedToUserId?: string;
};

export type ApplicationListInput = {
  jobId?: string;
  status?: "Active" | "Archived" | "Hired" | "Lead" | "All";
  cursor?: string;
  limit?: number;
};

export type InterviewListInput = {
  applicationId?: string;
  interviewScheduleId?: string;
  interviewId?: string;
  cursor?: string;
};

export type ApplicationStageChangeInput = {
  applicationId: string;
  interviewStageId: string;
  archiveReasonId?: string;
};

export type AshbyApiClientOptions = {
  apiKey: string;
  userAgent?: string;
  fetchImpl?: typeof fetch;
};

export class AshbyApiError extends Error {
  status?: number;
  data?: unknown;

  constructor(message: string, options: { status?: number; data?: unknown } = {}) {
    super(message);
    this.name = "AshbyApiError";
    this.status = options.status;
    this.data = options.data;
  }
}

export class AshbyApiClient {
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AshbyApiClientOptions) {
    this.apiKey = options.apiKey;
    this.userAgent = options.userAgent || "ashby-cli/0.1.0";
    this.fetchImpl = options.fetchImpl || fetch;
  }

  private getAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`;
  }

  async request<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<AshbyResponse<T>> {
    const response = await this.fetchImpl(`${BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json; version=1",
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
        "User-Agent": this.userAgent,
      },
      body: JSON.stringify(body),
    });

    let data: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw new AshbyApiError(`Ashby API error: ${response.status} ${response.statusText}`, {
        status: response.status,
        data,
      });
    }

    return (data || { success: true }) as AshbyResponse<T>;
  }

  async apiKeyInfo() {
    return this.request<any>("apiKey.info");
  }

  async candidateSearch(input: CandidateSearchParams) {
    return this.request<any[]>("candidate.search", input);
  }

  async candidateInfo(candidateId: string) {
    return this.request<any>("candidate.info", { candidateId });
  }

  async candidateCreate(input: CandidateCreateInput) {
    return this.request<any>("candidate.create", input as unknown as Record<string, unknown>);
  }

  async candidateCreateNote(candidateId: string, note: string) {
    return this.request<any>("candidate.createNote", { candidateId, note });
  }

  async applicationList(input: ApplicationListInput = {}) {
    return this.request<any[]>("application.list", input as unknown as Record<string, unknown>);
  }

  async applicationInfo(applicationId: string) {
    return this.request<any>("application.info", { applicationId });
  }

  async applicationListHistory(applicationId: string) {
    return this.request<any[]>("application.listHistory", { applicationId });
  }

  async applicationFeedbackList(applicationId: string) {
    return this.request<any[]>("applicationFeedback.list", { applicationId });
  }

  async applicationCreate(input: ApplicationCreateInput) {
    return this.request<any>("application.create", input as unknown as Record<string, unknown>);
  }

  async applicationChangeStage(input: ApplicationStageChangeInput) {
    return this.request<any>("application.changeStage", input as unknown as Record<string, unknown>);
  }

  async interviewStageList(interviewPlanId: string) {
    return this.request<any[]>("interviewStage.list", { interviewPlanId });
  }

  async candidateListNotes(candidateId: string, cursor?: string) {
    return this.request<any[]>("candidate.listNotes", cursor ? { candidateId, cursor } : { candidateId });
  }

  async interviewScheduleList(input: InterviewListInput = {}) {
    return this.request<any[]>("interviewSchedule.list", input as unknown as Record<string, unknown>);
  }

  async interviewEventList(input: InterviewListInput = {}) {
    return this.request<any[]>("interviewEvent.list", input as unknown as Record<string, unknown>);
  }

  async interviewInfo(interviewId: string) {
    return this.request<any>("interview.info", { interviewId });
  }
}
