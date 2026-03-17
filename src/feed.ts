export type FeedItem = {
  kind: string;
  at: string;
  title: string;
  detail?: string;
  sourceId?: string;
  raw?: unknown;
};

function firstTimestamp(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function mapHistoryItem(item: any): FeedItem | null {
  const at = firstTimestamp(item?.enteredStageAt, item?.createdAt, item?.updatedAt);
  if (!at) return null;
  return {
    kind: "stage_changed",
    at,
    title: item?.title ? `Entered stage: ${item.title}` : "Entered stage",
    detail: safeString(item?.stageId),
    sourceId: safeString(item?.id),
    raw: item,
  };
}

function mapNoteItem(item: any): FeedItem | null {
  const at = firstTimestamp(item?.createdAt, item?.updatedAt);
  if (!at) return null;
  const author =
    [safeString(item?.author?.firstName), safeString(item?.author?.lastName)].filter(Boolean).join(" ").trim() ||
    safeString(item?.author?.email);
  return {
    kind: "note_added",
    at,
    title: author ? `Note by ${author}` : "Note added",
    detail: safeString(item?.note),
    sourceId: safeString(item?.id),
    raw: item,
  };
}

function mapFeedbackItem(item: any): FeedItem | null {
  const at = firstTimestamp(item?.submittedAt, item?.createdAt, item?.updatedAt);
  if (!at) return null;
  const author =
    [safeString(item?.author?.firstName), safeString(item?.author?.lastName)].filter(Boolean).join(" ").trim() ||
    safeString(item?.author?.email);
  return {
    kind: "feedback_submitted",
    at,
    title: author ? `Feedback from ${author}` : "Feedback submitted",
    detail: safeString(item?.recommendation) || safeString(item?.feedbackFormDefinition?.title),
    sourceId: safeString(item?.id),
    raw: item,
  };
}

function mapScheduleItem(item: any): FeedItem | null {
  const at = firstTimestamp(item?.updatedAt, item?.createdAt);
  if (!at) return null;
  return {
    kind: "interview_schedule",
    at,
    title: item?.status ? `Interview schedule: ${item.status}` : "Interview scheduled",
    detail: safeString(item?.interviewStageId),
    sourceId: safeString(item?.id),
    raw: item,
  };
}

function mapInterviewEventItem(item: any): FeedItem | null {
  const at = firstTimestamp(item?.startTime, item?.updatedAt, item?.createdAt);
  if (!at) return null;
  const interviewerNames = Array.isArray(item?.interviewers)
    ? item.interviewers
        .map((interviewer: any) => [safeString(interviewer?.firstName), safeString(interviewer?.lastName)].filter(Boolean).join(" ").trim())
        .filter(Boolean)
        .join(", ")
    : "";
  return {
    kind: "interview_event",
    at,
    title: interviewerNames ? `Interview event with ${interviewerNames}` : "Interview event",
    detail: safeString(item?.meetingLink) || safeString(item?.location),
    sourceId: safeString(item?.id),
    raw: item,
  };
}

export function buildApplicationFeed(input: {
  history?: any[];
  notes?: any[];
  feedback?: any[];
  schedules?: any[];
  interviewEvents?: any[];
}): FeedItem[] {
  const scheduleItems = (input.schedules || []).flatMap((schedule) => {
    const mapped: FeedItem[] = [];
    const scheduleItem = mapScheduleItem(schedule);
    if (scheduleItem) mapped.push(scheduleItem);
    if (Array.isArray(schedule?.interviewEvents)) {
      for (const interviewEvent of schedule.interviewEvents) {
        const eventItem = mapInterviewEventItem(interviewEvent);
        if (eventItem) mapped.push(eventItem);
      }
    }
    return mapped;
  });

  const explicitEventItems = (input.interviewEvents || [])
    .map((item) => mapInterviewEventItem(item))
    .filter((item): item is FeedItem => Boolean(item));

  const all = [
    ...(input.history || []).map((item) => mapHistoryItem(item)),
    ...(input.notes || []).map((item) => mapNoteItem(item)),
    ...(input.feedback || []).map((item) => mapFeedbackItem(item)),
    ...scheduleItems,
    ...explicitEventItems,
  ].filter((item): item is FeedItem => Boolean(item));

  const seen = new Set<string>();
  const deduped: FeedItem[] = [];
  for (const item of all) {
    const key = `${item.kind}:${item.sourceId || ""}:${item.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function formatFeedItem(item: FeedItem): string {
  return `${item.at}\t${item.kind}\t${item.title}${item.detail ? `\t${item.detail}` : ""}`;
}
