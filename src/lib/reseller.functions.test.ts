import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  context: { userId: "reseller-user" },
  appRole: "reseller",
  profileStatus: "pending" as string | null,
  activeMembershipId: null as string | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(
      fn: (input: { context: typeof fixture.context; data: unknown }) => Promise<unknown>,
    ) {
      return (options: { data?: unknown }) =>
        fn({ context: fixture.context, data: options.data });
    },
  }),
}));

vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));

vi.mock("zod", () => {
  const schema = {
    trim() {
      return schema;
    },
    min() {
      return schema;
    },
    max() {
      return schema;
    },
    regex() {
      return schema;
    },
    url() {
      return schema;
    },
    email() {
      return schema;
    },
    uuid() {
      return schema;
    },
    nullable() {
      return schema;
    },
    extend() {
      return schema;
    },
    parse(value: unknown) {
      return value;
    },
  };
  return {
    z: {
      object: () => schema,
      string: () => schema,
    },
  };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { app_metadata: { role: fixture.appRole } } },
          error: null,
        }),
      },
    },
    from(table: string) {
      const data =
        table === "reseller_profiles"
          ? fixture.profileStatus
            ? { user_id: fixture.context.userId, status: fixture.profileStatus }
            : null
          : fixture.activeMembershipId
            ? { id: fixture.activeMembershipId }
            : null;
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        in() {
          return query;
        },
        maybeSingle: async () => ({ data, error: null }),
        then(
          resolve: (value: { data: unknown[]; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));

import { getResellerWorkspace } from "./reseller.functions";

describe("reseller workspace access", () => {
  beforeEach(() => {
    fixture.appRole = "reseller";
    fixture.profileStatus = "pending";
    fixture.activeMembershipId = null;
  });

  it("denies a pending reseller even when the caller has the reseller app role", async () => {
    await expect(getResellerWorkspace({ data: undefined })).rejects.toThrow(
      "This reseller account cannot manage clients or team members.",
    );
  });

  it("denies an approved reseller whose membership payment is not active", async () => {
    fixture.profileStatus = "approved";

    await expect(getResellerWorkspace({ data: undefined })).rejects.toThrow(
      "An active reseller membership is required to manage clients or team members.",
    );
  });

  it("allows an approved reseller with an active membership to load their workspace", async () => {
    fixture.profileStatus = "approved";
    fixture.activeMembershipId = "active-membership";

    await expect(getResellerWorkspace({ data: undefined })).resolves.toMatchObject({
      clients: [],
      teamLeaders: [],
      teamMembers: [],
    });
  });
});
