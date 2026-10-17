import { expect, it } from "vitest";
import { getInactiveReviews } from "./evidence-tracking";

const now = Date.parse("2026-10-17T12:00:00.000Z");
const old = "2026-10-10T12:00:00.000Z";

it("alerts for a pending review at the seven-day no-activity threshold", () => {
  expect(
    getInactiveReviews(
      [
        {
          id: "case-1",
          business_name: "Shop",
          status: "in_progress",
          assigned_at: old,
          updated_at: old,
        },
      ],
      [],
      now,
    ).map((item) => item.id),
  ).toEqual(["case-1"]);
});

it("does not alert before seven days or after recent case activity", () => {
  expect(
    getInactiveReviews(
      [
        {
          id: "recent",
          business_name: "Recent",
          status: "in_progress",
          assigned_at: old,
          updated_at: old,
        },
      ],
      [{ caseId: "recent", createdAt: "2026-10-17T11:00:00.000Z" }],
      now,
    ),
  ).toEqual([]);
  expect(
    getInactiveReviews(
      [
        {
          id: "under-seven",
          business_name: "New",
          status: "open",
          assigned_at: "2026-10-10T12:00:01.000Z",
          updated_at: "2026-10-10T12:00:01.000Z",
        },
      ],
      [],
      now,
    ),
  ).toEqual([]);
});

it("ignores completed reviews even when old", () => {
  expect(
    getInactiveReviews(
      [
        {
          id: "closed",
          business_name: "Closed",
          status: "closed",
          assigned_at: old,
          updated_at: old,
        },
      ],
      [],
      now,
    ),
  ).toEqual([]);
});
