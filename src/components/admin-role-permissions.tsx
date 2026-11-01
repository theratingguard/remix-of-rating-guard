import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  rolePermissionsOverviewSchema,
  rolePermissionsUpdateSchema,
} from "@/lib/admin-role-permissions-schema";

const scopeLabels = {
  platform: "Platform",
  reseller: "Reseller",
  organization: "Organization",
  team: "Team",
  geography: "Geographic",
} as const;

function categoryLabel(key: string) {
  return (key.split(".")[0] ?? "other")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AdminRolePermissions() {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<string[] | null>(null);

  const query = useQuery({
    queryKey: ["admin-role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_rbac_overview");
      if (error) throw error;
      return rolePermissionsOverviewSchema.parse(data);
    },
  });

  const selectedRole =
    query.data?.roles.find((role) => role.id === selectedRoleId) ?? query.data?.roles[0];
  const activePermissions = draftPermissions ?? selectedRole?.permissions ?? [];
  const sortedCurrent = [...(selectedRole?.permissions ?? [])].sort();
  const sortedDraft = [...activePermissions].sort();
  const isDirty =
    draftPermissions !== null && JSON.stringify(sortedCurrent) !== JSON.stringify(sortedDraft);

  const visibleRoles = (query.data?.roles ?? []).filter((role) =>
    `${role.name} ${role.code} ${scopeLabels[role.scope_type]}`
      .toLowerCase()
      .includes(roleSearch.trim().toLowerCase()),
  );
  const permissionGroups = useMemo(() => {
    const search = permissionSearch.trim().toLowerCase();
    const visible = (query.data?.permissions ?? []).filter(
      (permission) =>
        !search || `${permission.key} ${permission.description}`.toLowerCase().includes(search),
    );
    const groups = new Map<string, typeof visible>();
    for (const permission of visible) {
      const category = categoryLabel(permission.key);
      groups.set(category, [...(groups.get(category) ?? []), permission]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [permissionSearch, query.data?.permissions]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedRole) throw new Error("Select a role before saving changes.");
      const { data, error } = await supabase.rpc("admin_rbac_update_role_permissions", {
        _role_id: selectedRole.id,
        _permission_keys: activePermissions,
      });
      if (error) throw error;
      return rolePermissionsUpdateSchema.parse(data);
    },
    onSuccess: async (result) => {
      setDraftPermissions(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-role-permissions"] });
      toast.success(`Permissions saved for ${selectedRole?.name ?? result.role_id}.`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Permission changes were not saved.");
    },
  });

  function togglePermission(permissionKey: string, checked: boolean) {
    setDraftPermissions((current) => {
      const permissions = current ?? selectedRole?.permissions ?? [];
      return checked
        ? [...new Set([...permissions, permissionKey])].sort()
        : permissions.filter((permission) => permission !== permissionKey);
    });
  }

  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading role access…</p>;
  if (query.error || !query.data) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
      >
        Role permissions are unavailable: {query.error?.message ?? "No access data was returned."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Role Permissions"
        subtitle="Review role access and update the capabilities used by tenant security policies."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="hover:translate-y-0">
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">Configured roles</p>
              <p className="text-xl font-semibold">{query.data.roles.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:translate-y-0">
          <CardContent className="flex items-center gap-3 p-4">
            <LockKeyhole className="size-5 text-primary" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">Available permissions</p>
              <p className="text-xl font-semibold">{query.data.permissions.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:translate-y-0">
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">Selected role grants</p>
              <p className="text-xl font-semibold">{activePermissions.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <Card className="hover:translate-y-0">
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="font-semibold">Access roles</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose a role to inspect its current grants.
              </p>
            </div>
            <Input
              value={roleSearch}
              onChange={(event) => setRoleSearch(event.target.value)}
              placeholder="Find a role"
              aria-label="Find a role"
            />
            <div className="max-h-[34rem] space-y-2 overflow-y-auto">
              {visibleRoles.map((role) => {
                const selected = selectedRole?.id === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    disabled={save.isPending}
                    onClick={() => {
                      if (isDirty && !window.confirm("Discard your unsaved permission changes?"))
                        return;
                      setSelectedRoleId(role.id);
                      setDraftPermissions(null);
                    }}
                    aria-current={selected ? "true" : undefined}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{role.name}</span>
                      <Badge variant={role.is_system ? "secondary" : "outline"}>
                        {role.is_system ? "Built-in" : "Custom"}
                      </Badge>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {scopeLabels[role.scope_type]} · {role.permissions.length} permissions
                    </span>
                  </button>
                );
              })}
              {visibleRoles.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No roles match this search.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:translate-y-0">
          <CardContent className="space-y-5 p-4 sm:p-6">
            {!selectedRole ? (
              <p className="text-sm text-muted-foreground">
                Select a role to view its permissions.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedRole.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedRole.code} · {scopeLabels[selectedRole.scope_type]} scope
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isDirty && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDraftPermissions(null)}
                        disabled={save.isPending}
                      >
                        Discard
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => save.mutate()}
                      disabled={!isDirty || save.isPending || selectedRole.code === "super_admin"}
                    >
                      <Save className="mr-2 size-4" aria-hidden />
                      {save.isPending ? "Saving…" : "Save permissions"}
                    </Button>
                  </div>
                </div>

                {selectedRole.code === "super_admin" && (
                  <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                    This role retains full platform access and cannot be edited here.
                  </p>
                )}

                <Input
                  value={permissionSearch}
                  onChange={(event) => setPermissionSearch(event.target.value)}
                  placeholder="Search capabilities"
                  aria-label="Search permissions"
                />

                <div className="space-y-4">
                  {permissionGroups.map(([category, permissions]) => (
                    <section key={category} className="rounded-lg border">
                      <h3 className="border-b px-4 py-2.5 text-sm font-semibold">{category}</h3>
                      <div className="divide-y">
                        {permissions.map((permission) => {
                          const protectedAdminGrant =
                            permission.key === "platform.admin.manage" &&
                            selectedRole.code !== "super_admin";
                          return (
                            <label
                              key={permission.key}
                              className={`flex gap-3 p-4 ${
                                selectedRole.code === "super_admin" || protectedAdminGrant
                                  ? "cursor-not-allowed opacity-60"
                                  : "cursor-pointer"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1 size-4 shrink-0 accent-primary"
                                checked={activePermissions.includes(permission.key)}
                                disabled={
                                  save.isPending ||
                                  selectedRole.code === "super_admin" ||
                                  protectedAdminGrant
                                }
                                onChange={(event) =>
                                  togglePermission(permission.key, event.target.checked)
                                }
                              />
                              <span className="min-w-0">
                                <span className="block break-all font-mono text-xs font-medium">
                                  {permission.key}
                                </span>
                                <span className="mt-1 block text-sm text-muted-foreground">
                                  {permission.description}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  {permissionGroups.length === 0 && (
                    <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                      No permissions match this search.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
