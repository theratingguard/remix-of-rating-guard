import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isGoogleMapsUrl } from "@/lib/google-url";
import type { Tables } from "@/integrations/supabase/types";

const resellerBusinessSchema = z.object({
  businessName: z.string().trim().min(1).max(160),
  mapsUrl: z.string().trim().url().max(2048),
  ownerName: z.string().trim().min(1).max(120),
  ownerEmail: z.string().trim().email().max(320),
  ownerMobile: z.string().trim().min(6).max(32).regex(/^[+()\d\s.-]+$/),
});

const resellerTeamMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  mobileNumber: z.string().trim().min(6).max(32).regex(/^[+()\d\s.-]+$/),
});

const assignBusinessSchema = z.object({
  resellerBusinessId: z.string().uuid(),
  teamLeaderId: z.string().uuid().nullable(),
});

type WorkspaceBusiness = Pick<
  Tables<"businesses">,
  "id" | "name" | "maps_uri" | "place_id" | "address" | "created_at"
>;
type WorkspaceStaff = Pick<
  Tables<"staff">,
  "id" | "unique_id" | "name" | "email" | "mobile" | "role" | "status" | "team_id" | "team_leader_id"
>;

async function getResellerAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authError) throw new Error(`Could not verify reseller access: ${authError.message}`);
  if (authResult.user?.app_metadata["role"] !== "reseller")
    throw new Error("Reseller access is required.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("reseller_profiles")
    .select("user_id,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load reseller status: ${profileError.message}`);
  if (!profile || profile.status !== "approved")
    throw new Error("This reseller account cannot manage clients or team members.");

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("reseller_memberships")
    .select("id")
    .eq("reseller_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError)
    throw new Error(`Could not verify reseller membership: ${membershipError.message}`);
  if (!membership)
    throw new Error("An active reseller membership is required to manage clients or team members.");

  return { supabaseAdmin, profile };
}

async function removeCreatedAuthUser(userId: string, operationError: unknown, teamId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const teamCleanup = teamId
    ? supabaseAdmin.from("teams").delete().eq("id", teamId)
    : supabaseAdmin.from("teams").delete().eq("team_leader_id", userId);
  const { error: teamError } = await teamCleanup;
  if (teamError)
    throw new Error(
      `${operationError instanceof Error ? operationError.message : "Account creation failed."} Team cleanup failed: ${teamError.message}`,
    );
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError)
    throw new Error(
      `${operationError instanceof Error ? operationError.message : "Account creation failed."} Auth cleanup failed: ${authError.message}`,
    );
}

export const getResellerWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, profile } = await getResellerAdmin(context.userId);
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from("reseller_businesses")
      .select("id,business_id,owner_name,owner_email,owner_mobile,team_leader_id,created_at")
      .eq("reseller_id", profile.user_id)
      .order("created_at", { ascending: false });
    if (businessesError)
      throw new Error(`Could not load your businesses: ${businessesError.message}`);

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id,team_leader_id")
      .eq("reseller_id", profile.user_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (teamsError) throw new Error(`Could not load your teams: ${teamsError.message}`);

    const teamIds = (teams ?? []).map((team) => team.id);
    const businessIds = (businesses ?? []).map((business) => business.business_id);
    const [businessRows, staffRows]: [
      { data: WorkspaceBusiness[] | null; error: { message: string } | null },
      { data: WorkspaceStaff[] | null; error: { message: string } | null },
    ] = await Promise.all([
      businessIds.length
        ? supabaseAdmin
            .from("businesses")
            .select("id,name,maps_uri,place_id,address,created_at")
            .in("id", businessIds)
        : Promise.resolve({ data: [], error: null }),
      teamIds.length
        ? supabaseAdmin
            .from("staff")
            .select("id,unique_id,name,email,mobile,role,status,team_id,team_leader_id")
            .in("team_id", teamIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (businessRows.error)
      throw new Error(`Could not load your business details: ${businessRows.error.message}`);
    if (staffRows.error)
      throw new Error(`Could not load your team members: ${staffRows.error.message}`);

    const businessById = new Map((businessRows.data ?? []).map((business) => [business.id, business]));
    const staffById = new Map((staffRows.data ?? []).map((staff) => [staff.id, staff]));
    const teamLeaderIds = new Set((teams ?? []).map((team) => team.team_leader_id));
    return {
      clients: (businesses ?? []).map((client) => {
        const business = businessById.get(client.business_id);
        const leader = client.team_leader_id ? staffById.get(client.team_leader_id) : null;
        return {
          id: client.id,
          businessId: client.business_id,
          ownerName: client.owner_name,
          ownerEmail: client.owner_email,
          ownerMobile: client.owner_mobile,
          teamLeaderId: client.team_leader_id,
          createdAt: client.created_at,
          name: business?.name ?? "Business record unavailable",
          mapsUrl: business?.maps_uri ?? "",
          placeId: business?.place_id ?? null,
          address: business?.address ?? null,
          teamLeaderName: leader?.name ?? null,
        };
      }),
      teamLeaders: (teams ?? []).flatMap((team) => {
        const leader = staffById.get(team.team_leader_id);
        if (!leader) return [];
        return [{
          id: leader.id,
          teamId: team.id,
          uniqueId: leader.unique_id,
          name: leader.name,
          email: leader.email,
          mobile: leader.mobile,
          status: leader.status,
          memberCount: (staffRows.data ?? []).filter(
            (staff) => staff.team_leader_id === leader.id && !teamLeaderIds.has(staff.id),
          ).length,
        }];
      }),
      teamMembers: (staffRows.data ?? [])
        .filter((staff) => !teamLeaderIds.has(staff.id))
        .map((staff) => ({
          id: staff.id,
          uniqueId: staff.unique_id,
          name: staff.name,
          email: staff.email,
          teamLeaderId: staff.team_leader_id,
          teamLeaderName: staff.team_leader_id
            ? (staffById.get(staff.team_leader_id)?.name ?? "Team Leader")
            : "Unassigned",
          status: staff.status,
        })),
    };
  });

export const createResellerBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => resellerBusinessSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!isGoogleMapsUrl(data.mapsUrl))
      throw new Error("Enter a valid Google Maps business URL.");
    const { parseMapsUrl } = await import("@/lib/google-places.server");
    const parsedMapsUrl = parseMapsUrl(data.mapsUrl);
    const { supabaseAdmin, profile } = await getResellerAdmin(context.userId);
    const { data: existingBusiness, error: existingError } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("user_id", profile.user_id)
      .eq("maps_uri", data.mapsUrl)
      .maybeSingle();
    if (existingError)
      throw new Error(`Could not check for a duplicate business: ${existingError.message}`);
    if (existingBusiness) throw new Error("This Google Maps business has already been added.");

    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .insert({
        user_id: profile.user_id,
        name: data.businessName,
        maps_uri: data.mapsUrl,
        place_id: parsedMapsUrl.placeId ?? null,
        is_seed: false,
      })
      .select("id")
      .single();
    if (businessError || !business)
      throw new Error(
        businessError?.code === "23505"
          ? "This Google Maps business has already been added."
          : `Could not create the business: ${businessError?.message ?? "No business record was returned."}`,
      );

    const { error: linkError } = await supabaseAdmin.from("reseller_businesses").insert({
      reseller_id: profile.user_id,
      business_id: business.id,
      owner_name: data.ownerName,
      owner_email: data.ownerEmail.toLowerCase(),
      owner_mobile: data.ownerMobile,
    });
    if (linkError) {
      const { error: cleanupError } = await supabaseAdmin
        .from("businesses")
        .delete()
        .eq("id", business.id)
        .eq("user_id", profile.user_id);
      if (cleanupError)
        throw new Error(
          `Could not link the business to your reseller account: ${linkError.message}. Business cleanup failed: ${cleanupError.message}`,
        );
      throw new Error(
        linkError.code === "23505"
          ? "This business has already been added."
          : `Could not save the business owner details: ${linkError.message}`,
      );
    }
    return { id: business.id };
  });

export const createResellerTeamLeader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => resellerTeamMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, profile } = await getResellerAdmin(context.userId);
    const email = data.email.toLowerCase();
    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      app_metadata: { role: "staff" },
      user_metadata: { name: data.name, role: "team_leader" },
    });
    if (authError || !authResult.user)
      throw new Error(authError?.message ?? "Could not create the Team Leader login.");

    let teamId: string | undefined;
    try {
      const { error: staffError } = await supabaseAdmin.from("staff").insert({
        id: authResult.user.id,
        name: data.name,
        email,
        mobile: data.mobileNumber,
        mobile_number: data.mobileNumber,
        region_city: "Unknown",
        region_state: "Unknown",
        role: "Team Leader",
        status: "active",
        team_leader_id: authResult.user.id,
        team_lead: authResult.user.id,
        approved_by: profile.user_id,
        approved_at: new Date().toISOString(),
      });
      if (staffError) throw new Error(`Could not save the Team Leader profile: ${staffError.message}`);

      const { data: team, error: teamError } = await supabaseAdmin
        .from("teams")
        .insert({
          manager_id: null,
          reseller_id: profile.user_id,
          team_leader_id: authResult.user.id,
          created_by: profile.user_id,
        })
        .select("id")
        .single();
      if (teamError || !team)
        throw new Error(`Could not create the Team Leader's team: ${teamError?.message ?? "No team was returned."}`);
      teamId = team.id;

      const { error: updateError } = await supabaseAdmin
        .from("staff")
        .update({ team_id: team.id })
        .eq("id", authResult.user.id);
      if (updateError)
        throw new Error(`Could not assign the Team Leader's team: ${updateError.message}`);

      const { error: activityError } = await supabaseAdmin.from("staff_activity_log").insert({
        staff_id: authResult.user.id,
        action: "reseller_added_team_leader",
        metadata: { reseller_id: profile.user_id, team_id: team.id },
      });
      if (activityError)
        throw new Error(`Could not record Team Leader creation: ${activityError.message}`);
      return { id: authResult.user.id, teamId: team.id };
    } catch (error) {
      await removeCreatedAuthUser(authResult.user.id, error, teamId);
      throw error;
    }
  });

export const createResellerStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    resellerTeamMemberSchema.extend({ teamLeaderId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, profile } = await getResellerAdmin(context.userId);
    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .select("id,team_leader_id")
      .eq("reseller_id", profile.user_id)
      .eq("team_leader_id", data.teamLeaderId)
      .eq("is_active", true)
      .maybeSingle();
    if (teamError) throw new Error(`Could not verify the selected Team Leader: ${teamError.message}`);
    if (!team) throw new Error("Select an active Team Leader on your reseller team.");

    const email = data.email.toLowerCase();
    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      app_metadata: { role: "staff" },
      user_metadata: { name: data.name, role: "team_member" },
    });
    if (authError || !authResult.user)
      throw new Error(authError?.message ?? "Could not create the Staff/Member login.");

    try {
      const { error: staffError } = await supabaseAdmin.from("staff").insert({
        id: authResult.user.id,
        name: data.name,
        email,
        mobile: data.mobileNumber,
        mobile_number: data.mobileNumber,
        region_city: "Unknown",
        region_state: "Unknown",
        role: "Staff",
        status: "active",
        team_id: team.id,
        team_leader_id: team.team_leader_id,
        team_lead: team.team_leader_id,
        reports_to: team.team_leader_id,
        approved_by: profile.user_id,
        approved_at: new Date().toISOString(),
      });
      if (staffError) throw new Error(`Could not save the Staff/Member profile: ${staffError.message}`);

      const { error: activityError } = await supabaseAdmin.from("staff_activity_log").insert({
        staff_id: authResult.user.id,
        action: "reseller_added_staff_member",
        metadata: {
          reseller_id: profile.user_id,
          team_id: team.id,
          team_leader_id: team.team_leader_id,
        },
      });
      if (activityError)
        throw new Error(`Could not record Staff/Member creation: ${activityError.message}`);
      return { id: authResult.user.id, teamId: team.id };
    } catch (error) {
      await removeCreatedAuthUser(authResult.user.id, error);
      throw error;
    }
  });

export const assignResellerBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => assignBusinessSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, profile } = await getResellerAdmin(context.userId);
    const { data: client, error: clientError } = await supabaseAdmin
      .from("reseller_businesses")
      .select("id")
      .eq("id", data.resellerBusinessId)
      .eq("reseller_id", profile.user_id)
      .maybeSingle();
    if (clientError) throw new Error(`Could not verify business ownership: ${clientError.message}`);
    if (!client) throw new Error("This business is not assigned to your reseller account.");

    if (data.teamLeaderId) {
      const { data: team, error: teamError } = await supabaseAdmin
        .from("teams")
        .select("id")
        .eq("reseller_id", profile.user_id)
        .eq("team_leader_id", data.teamLeaderId)
        .eq("is_active", true)
        .maybeSingle();
      if (teamError) throw new Error(`Could not verify the selected Team Leader: ${teamError.message}`);
      if (!team) throw new Error("Select an active Team Leader on your reseller team.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("reseller_businesses")
      .update({ team_leader_id: data.teamLeaderId, updated_at: new Date().toISOString() })
      .eq("id", client.id)
      .eq("reseller_id", profile.user_id);
    if (updateError) throw new Error(`Could not assign the business: ${updateError.message}`);
    return { id: client.id };
  });
