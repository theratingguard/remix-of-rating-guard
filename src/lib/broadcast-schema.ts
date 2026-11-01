import { z } from "zod";
import { HIERARCHY_ROLES } from "@/lib/management-hierarchy";

export const broadcastOptionsSchema = z.object({
  teams: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
  roles: z.array(z.enum(HIERARCHY_ROLES)),
});

export const broadcastStaffSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(5000),
    audience: z.enum(["all_staff", "specific_team", "specific_role"]),
    teamId: z.string().uuid().optional(),
    role: z.enum(HIERARCHY_ROLES).optional(),
    createTask: z.boolean(),
    reviewUrl: z.string().trim().max(2048).optional().default(""),
  })
  .superRefine((input, context) => {
    if (input.audience === "specific_team" && !input.teamId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teamId"],
        message: "Select a team.",
      });
    }
    if (input.audience === "specific_role" && !input.role) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["role"],
        message: "Select a role.",
      });
    }
    if (input.reviewUrl && !input.createTask) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewUrl"],
        message: "A review URL can only be included with a task.",
      });
    }
    if (input.reviewUrl) {
      let parsed: URL;
      try {
        parsed = new URL(input.reviewUrl);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reviewUrl"],
          message: "Enter a valid Google review URL.",
        });
        return;
      }
      const googleHost =
        /^(?:[a-z0-9-]+\.)*google\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(parsed.hostname) ||
        ["maps.app.goo.gl", "goo.gl", "g.page"].includes(parsed.hostname);
      if (parsed.protocol !== "https:" || !googleHost) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reviewUrl"],
          message: "Enter a valid HTTPS Google review URL.",
        });
      }
    }
  });

export const broadcastResultSchema = z.object({
  notifications_sent: z.number().int().nonnegative(),
  active_recipients: z.number().int().nonnegative(),
  inactive_recipients: z.number().int().nonnegative(),
  tasks_created: z.number().int().nonnegative(),
});
