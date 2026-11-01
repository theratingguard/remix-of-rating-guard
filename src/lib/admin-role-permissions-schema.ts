import { z } from "zod";

const permissionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  description: z.string(),
});

const roleSchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string(),
  scope_type: z.enum(["platform", "reseller", "organization", "team", "geography"]),
  is_system: z.boolean(),
  permissions: z.array(z.string()),
});

export const rolePermissionsOverviewSchema = z.object({
  permissions: z.array(permissionSchema),
  roles: z.array(roleSchema),
});

export const rolePermissionsUpdateSchema = z.object({
  role_id: z.string().uuid(),
  permissions: z.array(z.string()),
});
