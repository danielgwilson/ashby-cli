import { describe, expect, it } from "vitest";
import { buildApplicationFeed, formatFeedItem } from "../src/feed.js";

describe("buildApplicationFeed", () => {
  it("merges and sorts feed items newest-first", () => {
    const feed = buildApplicationFeed({
      history: [{ id: "h1", title: "Application Review", enteredStageAt: "2026-01-01T00:00:00.000Z" }],
      notes: [{ id: "n1", note: "Strong candidate", createdAt: "2026-01-03T00:00:00.000Z", author: { firstName: "Dan", lastName: "W" } }],
      feedback: [{ id: "f1", submittedAt: "2026-01-02T00:00:00.000Z", recommendation: "yes" }],
      schedules: [
        {
          id: "s1",
          status: "Scheduled",
          updatedAt: "2026-01-05T00:00:00.000Z",
          interviewEvents: [{ id: "e1", startTime: "2026-01-04T00:00:00.000Z", interviewers: [{ firstName: "Dan", lastName: "W" }] }],
        },
      ],
    });

    expect(feed.map((item) => item.kind)).toEqual([
      "interview_schedule",
      "interview_event",
      "note_added",
      "feedback_submitted",
      "stage_changed",
    ]);
  });

  it("dedupes interview events when passed both nested and explicit lists", () => {
    const feed = buildApplicationFeed({
      schedules: [
        {
          id: "s1",
          updatedAt: "2026-01-02T00:00:00.000Z",
          interviewEvents: [{ id: "e1", startTime: "2026-01-01T00:00:00.000Z" }],
        },
      ],
      interviewEvents: [{ id: "e1", startTime: "2026-01-01T00:00:00.000Z" }],
    });

    expect(feed.filter((item) => item.kind === "interview_event")).toHaveLength(1);
  });
});

describe("formatFeedItem", () => {
  it("renders a compact human line", () => {
    expect(
      formatFeedItem({
        at: "2026-01-01T00:00:00.000Z",
        kind: "note_added",
        title: "Note by Dan W",
        detail: "Strong candidate",
      }),
    ).toBe("2026-01-01T00:00:00.000Z\tnote_added\tNote by Dan W\tStrong candidate");
  });
});
