import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getHierarchyChildRole, getHierarchyRole } from "@/lib/management-hierarchy";
import { logEvent } from "./logger.server";

const photoSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(1).max(7_100_000),
});

export const userDetailsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  mobileNumber: z.string().trim().max(32).optional(),
  photo: photoSchema.optional(),
});

type UserDetails = z.infer<typeof userDetailsSchema>;
type PhotoDetails = z.infer<typeof photoSchema>;
type UserRole = "Global Manager" | "Team Leader" | "Staff";
type UserClient = SupabaseClient<Database>;
export const superAdminUserSchema = userDetailsSchema.extend({
  role: z.enum(["Global Manager", "Team Leader", "Staff"]),
  teamId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
});
export const managerAddMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  mobileNumber: z.string().trim().min(6).max(32).regex(/^[+()\d\s.-]+$/),
  role: z.literal("Team Leader"),
});

export const hierarchyReportSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  mobileNumber: z.string().trim().min(6).max(32).regex(/^[+()\d\s.-]+$/),
});

export const createHierarchyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => hierarchyReportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parent, error: parentError } = await supabaseAdmin
      .from("staff")
      .select("id,name,role,status,region_city,region_state,location_id,team_id,manager_id,team_leader_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (parentError) throw new Error(`Could not verify your hierarchy role: ${parentError.message}`);

    const parentRole = getHierarchyRole(parent?.role);
    const childRole = parentRole ? getHierarchyChildRole(parentRole) : null;
    if (!parent || !childRole || !["active", "approved"].includes(parent.status))
      throw new Error("An active hierarchy manager account is required to add a direct report.");

    const email = data.email.toLowerCase();
    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      app_metadata: { role: "staff" },
      user_metadata: { role: childRole, name: data.name },
    });
    if (authError || !authResult.user)
      throw new Error(authError?.message ?? "The authentication account could not be created.");

    const { data: created, error: profileError } = await supabaseAdmin
      .from("staff")
      .insert({
        id: authResult.user.id,
        name: data.name,
        email,
        mobile: data.mobileNumber,
        mobile_number: data.mobileNumber,
        region_city: parent.region_city,
        region_state: parent.region_state,
        role: childRole,
        status: "active",
        reports_to: parent.id,
        location_id: parent.location_id,
        ...(childRole === "team_member"
          ? {
              team_id: parent.team_id,
              manager_id: parent.manager_id,
              team_leader_id: parent.id,
              team_lead: parent.id,
            }
          : {}),
      })
      .select("id,unique_id,role")
      .single();
    if (profileError || !created) {
      const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(authResult.user.id);
      if (cleanupError) {
        throw new Error(
          `${profileError?.message ?? "Could not create the hierarchy profile."} The Auth account could not be cleaned up: ${cleanupError.message}`,
        );
      }
      throw new Error(profileError?.message ?? "Could not create the hierarchy profile.");
    }

    if (childRole === "team_leader" && parentRole === "team_manager") {
      const { data: team, error: teamError } = await supabaseAdmin
        .from("teams")
        .insert({
          manager_id: parent.id,
          team_leader_id: created.id,
          created_by: parent.id,
        })
        .select("id")
        .single();
      if (teamError || !team) {
        const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(created.id);
        if (cleanupError) {
          throw new Error(
            `${teamError?.message ?? "Could not create the Team Leader's team."} The Auth account could not be cleaned up: ${cleanupError.message}`,
          );
        }
        throw new Error(teamError?.message ?? "Could not create the Team Leader's team.");
      }

      const { error: assignmentError } = await supabaseAdmin
        .from("staff")
        .update({
          team_id: team.id,
          manager_id: parent.id,
          team_leader_id: created.id,
          team_lead: created.id,
        })
        .eq("id", created.id);
      if (assignmentError) {
        const { error: teamCleanupError } = await supabaseAdmin.from("teams").delete().eq("id", team.id);
        const { error: authCleanupError } = await supabaseAdmin.auth.admin.deleteUser(created.id);
        const cleanupFailure = teamCleanupError ?? authCleanupError;
        if (cleanupFailure) {
          throw new Error(
            `${assignmentError.message} Cleanup also failed: ${cleanupFailure.message}`,
          );
        }
        throw new Error(`Could not assign the Team Leader's team: ${assignmentError.message}`);
      }
    }

    return created;
  });

export const managerAddMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => managerAddMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: accessLevel, error: accessError } = await context.supabase.rpc(
      "report_access_level",
    );
    if (accessError) throw new Error(`Could not verify Manager access: ${accessError.message}`);
    if (accessLevel === "super_admin") throw new Error("Manager access is required.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: manager, error: managerError } = await supabaseAdmin
      .from("staff")
      .select("id,role,status")
      .eq("id", context.userId)
      .maybeSingle();
    if (managerError) throw new Error(`Could not verify Manager access: ${managerError.message}`);
    if (
      !manager ||
      !["active", "approved"].includes(manager.status) ||
      !["manager", "team_manager"].includes(manager.role.toLowerCase().replaceAll(" ", "_"))
    )
      throw new Error("Manager access is required.");

    const managerRole = manager.role.toLowerCase().replaceAll(" ", "_");
    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .select("id,manager_id,team_leader_id")
      .eq("manager_id", context.userId)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (teamError) throw new Error(`Could not load the Manager's active team: ${teamError.message}`);
    const isCreatingManagedLeader = ["manager", "team_manager"].includes(managerRole);
    if (!team && !isCreatingManagedLeader)
      throw new Error("An active team is required before adding this member.");

    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      email_confirm: true,
      app_metadata: { role: "staff" },
      user_metadata: { role: data.role.toLowerCase().replace(" ", "_") },
    });
    if (authError || !authResult.user)
      throw new Error(authError?.message ?? "The authentication account could not be created.");

    let createdTeamId: string | null = null;
    try {
      const reportsTo = context.userId;
      const { error: profileError } = await supabaseAdmin.from("staff").insert({
        id: authResult.user.id,
        name: data.name,
        email: data.email.toLowerCase(),
        mobile: data.mobileNumber,
        mobile_number: data.mobileNumber,
        photo_url: null,
        region_city: "Unknown",
        region_state: "Unknown",
        role: data.role,
        status: "pending",
        team_id: null,
        manager_id: context.userId,
        team_leader_id: null,
        team_lead: null,
        reports_to: reportsTo,
      });
      if (profileError) {
        if (profileError.code === "23505") throw new Error("That email or mobile number is already in use.");
        throw new Error(`Could not save the member profile: ${profileError.message}`);
      }
      if (isCreatingManagedLeader) {
        const { data: createdTeam, error: createTeamError } = await supabaseAdmin
          .from("teams")
          .insert({
            manager_id: context.userId,
            team_leader_id: authResult.user.id,
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (createTeamError)
          throw new Error(`Could not create the Team Leader's team: ${createTeamError.message}`);
        createdTeamId = createdTeam.id;
        const { error: updateProfileError } = await supabaseAdmin
          .from("staff")
          .update({
            team_id: createdTeam.id,
            team_leader_id: authResult.user.id,
            team_lead: authResult.user.id,
          })
          .eq("id", authResult.user.id);
        if (updateProfileError)
          throw new Error(`Could not assign the Team Leader's team: ${updateProfileError.message}`);
      }
      const { error: activityError } = await supabaseAdmin.from("staff_activity_log").insert({
        staff_id: authResult.user.id,
        action: "manager_added_member",
        metadata: {
          role: data.role,
          status: "pending",
          created_by: context.userId,
          team_id: createdTeamId ?? team?.id ?? null,
        },
      });
      if (activityError) throw new Error(`Could not record member creation: ${activityError.message}`);

      const { data: created, error: createdError } = await supabaseAdmin
        .from("staff")
        .select("unique_id,role,team_id")
        .eq("id", authResult.user.id)
        .single();
      if (createdError) throw new Error(`Could not load the created member ID: ${createdError.message}`);
      const { maskUserData } = await import("@/lib/user-privacy");
      return maskUserData(created, manager.role);
    } catch (error) {
      if (createdTeamId) {
        const { error: teamCleanupError } = await supabaseAdmin
          .from("teams")
          .delete()
          .eq("id", createdTeamId);
        if (teamCleanupError)
          throw new Error(
            `${error instanceof Error ? error.message : "Member creation failed."} Team cleanup also failed.`,
          );
      }
      const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(authResult.user.id);
      if (cleanupError)
        throw new Error(
          `${error instanceof Error ? error.message : "Member creation failed."} Account cleanup also failed.`,
        );
      throw error;
    }
  });

function decodePhoto(photo: PhotoDetails) {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(photo.base64)
  )
    throw new Error("The profile photo data is invalid.");
  const bytes = Buffer.from(photo.base64, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new Error("Profile photos must be smaller than 5 MB.");

  const isJpeg =
    photo.contentType === "image/jpeg" &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isPng =
    photo.contentType === "image/png" &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    photo.contentType === "image/webp" &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp)
    throw new Error("The photo contents do not match its image type.");

  const extension = photo.contentType === "image/jpeg" ? "jpg" : photo.contentType.slice(6);
  return { bytes, extension };
}

async function requireSuperAdmin(client: UserClient) {
  const { data, error } = await client.rpc("report_access_level");
  if (error) throw new Error(`Could not verify Super Admin access: ${error.message}`);
  if (data !== "super_admin") throw new Error("Super Admin access is required.");
}

async function requireTeamLeader(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: leader, error: leaderError } = await supabaseAdmin
    .from("staff")
    .select("id,role,status")
    .eq("id", userId)
    .maybeSingle();
  if (leaderError) throw new Error(`Could not verify Team Leader access: ${leaderError.message}`);
  if (
    !leader ||
    !["approved", "active"].includes(leader.status) ||
    !["team leader", "team_leader", "team lead", "tl"].includes(leader.role.toLowerCase())
  )
    throw new Error("An active Team Leader account is required.");

  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .select("id,manager_id,team_leader_id")
    .eq("team_leader_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (teamError) throw new Error(`Could not load your active team: ${teamError.message}`);
  if (!team) throw new Error("No active team is assigned to this Team Leader account.");
  return team;
}

async function rollbackCreatedUser(userId: string, photoPath: string | null, teamId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const failures: string[] = [];
  if (teamId) {
    const { error } = await supabaseAdmin.from("teams").delete().eq("id", teamId);
    if (error) failures.push("team assignment");
  }
  if (photoPath) {
    const { error } = await supabaseAdmin.storage.from("profile-assets").remove([photoPath]);
    if (error) failures.push("profile photo");
  }
  const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (userError) failures.push("auth account");
  if (failures.length)
    throw new Error(`Cleanup could not remove the created ${failures.join(", ")}.`);
}

async function createStaffAccount(
  data: UserDetails,
  context: { userId: string; supabase: UserClient },
  options: {
    role: UserRole;
    status: "active" | "pending";
    teamId?: string;
    managerId?: string;
    teamLeaderId?: string;
    createTeamForLeader?: boolean;
  },
) {
  if (!data.mobileNumber?.trim() || !data.photo)
    throw new Error("Photo and Mobile are mandatory.");
  if (!/^[+()\d\s.-]{6,32}$/.test(data.mobileNumber))
    throw new Error("Enter a valid mobile number.");
  const { bytes, extension } = decodePhoto(data.photo);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: data.email.toLowerCase(),
    password: data.password,
    email_confirm: true,
    app_metadata: { role: "staff" },
    user_metadata: {
      name: data.name,
      mobile: data.mobileNumber,
      role: options.role.toLowerCase().replaceAll(" ", "_"),
    },
  });
  if (authError || !authResult.user)
    throw new Error(
      authError?.message ?? "The authentication account could not be created.",
    );

  const userId = authResult.user.id;
  let photoPath: string | null = null;
  let assignedTeamId: string | undefined;
  try {
    const nextPhotoPath = `${userId}/profile-${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("profile-assets")
      .upload(nextPhotoPath, bytes, { contentType: data.photo.contentType, upsert: false });
    if (uploadError) throw new Error(`Could not upload profile photo: ${uploadError.message}`);
    photoPath = nextPhotoPath;
    const photoUrl = supabaseAdmin.storage.from("profile-assets").getPublicUrl(photoPath).data
      .publicUrl;

    const { error: profileError } = await supabaseAdmin.from("staff").insert({
      id: userId,
      name: data.name,
      mobile: data.mobileNumber,
      mobile_number: data.mobileNumber,
      email: data.email.toLowerCase(),
      photo_url: photoUrl,
      region_city: "Unknown",
      region_state: "Unknown",
      role: options.role,
      status: options.status,
      team_id: options.teamId ?? null,
      manager_id: options.createTeamForLeader ? null : (options.managerId ?? null),
      team_leader_id: options.teamLeaderId ?? null,
      team_lead: options.teamLeaderId ?? null,
      reports_to:
        options.role === "Global Manager"
          ? null
          : options.createTeamForLeader
            ? (options.managerId ?? null)
            : (options.teamLeaderId ?? null),
      approved_by: options.status === "active" ? context.userId : null,
      approved_at: options.status === "active" ? new Date().toISOString() : null,
    });
    if (profileError) {
      if (profileError.code === "23505")
        throw new Error("That email or mobile number is already in use.");
      throw new Error(`Could not save the user profile: ${profileError.message}`);
    }

    if (options.createTeamForLeader && options.managerId) {
      const { data: teamId, error: teamError } = await context.supabase.rpc("admin_create_team", {
        _manager_id: options.managerId,
        _team_leader_id: userId,
      });
      if (teamError) throw new Error(`Could not assign a team to the Team Leader: ${teamError.message}`);
      assignedTeamId = teamId;
      const { error: updateError } = await supabaseAdmin
        .from("staff")
        .update({ team_id: teamId })
        .eq("id", userId);
      if (updateError) throw new Error(`Could not save the Team Leader's team: ${updateError.message}`);
    }

    const { error: activityError } = await supabaseAdmin.from("staff_activity_log").insert({
      staff_id: userId,
      action: options.status === "pending" ? "team_leader_added_staff" : "admin_created_user",
      metadata: {
        role: options.role,
        status: options.status,
        created_by: context.userId,
        team_id: options.teamId ?? assignedTeamId ?? null,
      },
    });
    if (activityError)
      throw new Error(`Could not record user creation activity: ${activityError.message}`);

    return {
      id: userId,
      name: data.name,
      email: data.email.toLowerCase(),
      role: options.role,
      status: options.status,
      photoUrl,
      teamId: options.teamId ?? assignedTeamId ?? null,
    };
  } catch (error) {
    try {
      await rollbackCreatedUser(userId, photoPath, assignedTeamId);
    } catch (cleanupError) {
      throw new Error(
        `${error instanceof Error ? error.message : "User creation failed."} ${cleanupError instanceof Error ? cleanupError.message : "Account cleanup also failed."}`,
      );
    }
    throw error;
  }
}

export const addStaffAsTeamLeader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => userDetailsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const team = await requireTeamLeader(context.userId);
    const created = await createStaffAccount(data, context, {
      role: "Staff",
      status: "pending",
      teamId: team.id,
      managerId: team.manager_id ?? undefined,
      teamLeaderId: team.team_leader_id,
    });
    logEvent("info", "team-leader.staff.created", "Team Leader added a pending staff account");
    return created;
  });

export const getUserCreationOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [staffResult, teamsResult] = await Promise.all([
      supabaseAdmin
        .from("staff")
        .select("id,name,role,status,manager_id,team_leader_id")
        .in("status", ["approved", "active"])
        .order("name"),
      supabaseAdmin
        .from("teams")
        .select("id,manager_id,team_leader_id")
        .eq("is_active", true),
    ]);
    if (staffResult.error) throw new Error(`Could not load user assignment options: ${staffResult.error.message}`);
    if (teamsResult.error) throw new Error(`Could not load active teams: ${teamsResult.error.message}`);
    const staff = staffResult.data ?? [];
    const names = new Map(staff.map((person) => [person.id, person.name]));
    return {
      managers: staff.filter(
        (person) =>
          ["manager", "team_manager"].includes(
            person.role.toLowerCase().replaceAll(" ", "_"),
          ) && !person.manager_id,
      ),
      teams: (teamsResult.data ?? []).map((team) => ({
        ...team,
        manager_name: team.manager_id
          ? (names.get(team.manager_id) ?? "Manager")
          : "Reseller-owned team",
        team_leader_name: names.get(team.team_leader_id) ?? "Team Leader",
      })),
    };
  });

export const addUserAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => superAdminUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let managerId: string | undefined;
    let teamLeaderId: string | undefined;
    let teamId: string | undefined;

    if (data.role === "Team Leader") {
      if (!data.managerId) throw new Error("Select a manager for this Team Leader.");
      const { data: manager, error } = await supabaseAdmin
        .from("staff")
        .select("id,role,status,manager_id,team_leader_id")
        .eq("id", data.managerId)
        .maybeSingle();
      if (error) throw new Error(`Could not verify the selected manager: ${error.message}`);
      if (
        !manager ||
        !["approved", "active"].includes(manager.status) ||
        !["manager", "team_manager"].includes(
          manager.role.toLowerCase().replaceAll(" ", "_"),
        ) ||
        manager.manager_id ||
        manager.team_leader_id
      )
        throw new Error("Select an active manager profile.");
      managerId = manager.id;
    } else if (data.role === "Staff") {
      if (!data.teamId) throw new Error("Select an active team for this staff member.");
      const { data: team, error } = await supabaseAdmin
        .from("teams")
        .select("id,manager_id,team_leader_id")
        .eq("id", data.teamId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw new Error(`Could not verify the selected team: ${error.message}`);
      if (!team) throw new Error("Select an active team.");
      teamId = team.id;
      managerId = team.manager_id ?? undefined;
      teamLeaderId = team.team_leader_id;
    }

    const created = await createStaffAccount(data, context, {
      role: data.role,
      status: "active",
      ...(teamId ? { teamId } : {}),
      ...(managerId && data.role === "Staff" ? { managerId } : {}),
      ...(teamLeaderId ? { teamLeaderId } : {}),
      ...(managerId && data.role === "Team Leader"
        ? { managerId, createTeamForLeader: true }
        : {}),
    });
    logEvent("info", "super-admin.user.created", "Super Admin created a user", {
      role: data.role,
    });
    return created;
  });
