import { describe, expect, it } from "vitest";
import { broadcastStaffSchema } from "./broadcast-schema";

const validBroadcast = {
  title: "Team update",
  message: "Please review the new guidance.",
  audience: "all_staff",
  createTask: false,
};

describe("broadcastStaffSchema", () => {
  it("accepts an all-staff announcement without a task", () => {
    expect(broadcastStaffSchema.safeParse(validBroadcast).success).toBe(true);
  });

  it("requires a team for a team audience", () => {
    expect(
      broadcastStaffSchema.safeParse({
        ...validBroadcast,
        audience: "specific_team",
      }).success,
    ).toBe(false);
  });

  it("requires a role for a role audience", () => {
    expect(
      broadcastStaffSchema.safeParse({
        ...validBroadcast,
        audience: "specific_role",
      }).success,
    ).toBe(false);
  });

  it("only accepts HTTPS Google review links on task broadcasts", () => {
    expect(
      broadcastStaffSchema.safeParse({
        ...validBroadcast,
        createTask: true,
        reviewUrl: "https://maps.google.com/?cid=123",
      }).success,
    ).toBe(true);
    expect(
      broadcastStaffSchema.safeParse({
        ...validBroadcast,
        reviewUrl: "https://maps.google.com/?cid=123",
      }).success,
    ).toBe(false);
    expect(
      broadcastStaffSchema.safeParse({
        ...validBroadcast,
        createTask: true,
        reviewUrl: "https://example.com/review",
      }).success,
    ).toBe(false);
  });
});
