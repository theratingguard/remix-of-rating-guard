import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const roles = [
  {
    alias: "demo_global",
    role: "global_manager",
    name: "Demo Global Manager",
    passwordVariable: "DEMO_GLOBAL_PASSWORD",
    mobile: "+10000000001",
    location: null,
    parent: null,
  },
  {
    alias: "demo_country",
    role: "country_manager",
    name: "Demo Country Manager",
    passwordVariable: "DEMO_COUNTRY_PASSWORD",
    mobile: "+10000000002",
    location: { slug: "demo-us", country: "United States" },
    parent: "demo_global",
  },
  {
    alias: "demo_state",
    role: "state_manager",
    name: "Demo State Manager",
    passwordVariable: "DEMO_STATE_PASSWORD",
    mobile: "+10000000003",
    location: { slug: "demo-us-ca", country: "United States", state: "California" },
    parent: "demo_country",
  },
  {
    alias: "demo_division",
    role: "divisional_manager",
    name: "Demo Divisional Manager",
    passwordVariable: "DEMO_DIVISION_PASSWORD",
    mobile: "+10000000004",
    location: {
      slug: "demo-us-ca-bay-area",
      country: "United States",
      state: "California",
      division: "Bay Area",
    },
    parent: "demo_state",
  },
  {
    alias: "demo_district",
    role: "district_manager",
    name: "Demo District Manager",
    passwordVariable: "DEMO_DISTRICT_PASSWORD",
    mobile: "+10000000005",
    location: {
      slug: "demo-us-ca-bay-area-sf",
      country: "United States",
      state: "California",
      division: "Bay Area",
      district: "San Francisco",
    },
    parent: "demo_division",
  },
  {
    alias: "demo_teammanager",
    role: "team_manager",
    name: "Demo Team Manager",
    passwordVariable: "DEMO_TEAMMANAGER_PASSWORD",
    mobile: "+10000000006",
    location: {
      slug: "demo-us-ca-bay-area-sf-city",
      country: "United States",
      state: "California",
      division: "Bay Area",
      district: "San Francisco",
      city: "San Francisco",
    },
    parent: "demo_district",
  },
  {
    alias: "demo_teamleader",
    role: "team_leader",
    name: "Demo Team Leader",
    passwordVariable: "DEMO_TEAMLEADER_PASSWORD",
    mobile: "+10000000007",
    location: {
      slug: "demo-us-ca-bay-area-sf-city",
      country: "United States",
      state: "California",
      division: "Bay Area",
      district: "San Francisco",
      city: "San Francisco",
    },
    parent: "demo_teammanager",
  },
  {
    alias: "demo_teammember",
    role: "team_member",
    name: "Demo Team Member",
    passwordVariable: "DEMO_TEAMMEMBER_PASSWORD",
    mobile: "+10000000008",
    location: {
      slug: "demo-us-ca-bay-area-sf-city",
      country: "United States",
      state: "California",
      division: "Bay Area",
      district: "San Francisco",
      city: "San Francisco",
    },
    parent: "demo_teamleader",
  },
];

const missing = required.filter((name) => !process.env[name]);
for (const { passwordVariable } of roles) {
  if (!process.env[passwordVariable]) missing.push(passwordVariable);
}
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const users = new Map();
const locations = new Map();

async function ensureLocation(location) {
  if (!location) return null;
  if (locations.has(location.slug)) return locations.get(location.slug);
  const { data, error } = await supabase
    .from("locations")
    .upsert(location, { onConflict: "slug" })
    .select("id")
    .single();
  if (error) throw new Error(`Could not save location ${location.slug}: ${error.message}`);
  locations.set(location.slug, data.id);
  return data.id;
}

async function listUsersByEmail() {
  const byEmail = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list Auth users: ${error.message}`);
    for (const user of data.users) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user);
    }
    if (data.users.length < 1000) return byEmail;
  }
}

const authUsers = await listUsersByEmail();
for (const definition of roles) {
  const email = `${definition.alias}@ratingguard.online`;
  const password = process.env[definition.passwordVariable];
  const metadata = { role: definition.role, demo_id: definition.alias, name: definition.name };
  let user = authUsers.get(email);

  if (user) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      app_metadata: { ...user.app_metadata, role: "staff" },
      user_metadata: { ...user.user_metadata, ...metadata },
    });
    if (error) throw new Error(`Could not update ${definition.alias}: ${error.message}`);
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "staff" },
      user_metadata: metadata,
    });
    if (error) throw new Error(`Could not create ${definition.alias}: ${error.message}`);
    user = data.user;
    authUsers.set(email, user);
  }
  users.set(definition.alias, user.id);
}

for (const definition of roles) {
  const locationId = await ensureLocation(definition.location);
  const userId = users.get(definition.alias);
  const parentId = definition.parent ? users.get(definition.parent) : null;
  const email = `${definition.alias}@ratingguard.online`;
  const roleLabel = definition.role === "team_member" ? "Team Member" : definition.role;
  const { error } = await supabase.from("staff").upsert(
    {
      id: userId,
      name: definition.name,
      email,
      mobile: definition.mobile,
      mobile_number: definition.mobile,
      region_city: definition.location?.city ?? "Global",
      region_state: definition.location?.state ?? "Global",
      role: roleLabel,
      status: "active",
      reports_to: parentId,
      location_id: locationId,
      login_alias: definition.alias,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Could not save ${definition.alias} profile: ${error.message}`);
}

const teamManagerId = users.get("demo_teammanager");
const teamLeaderId = users.get("demo_teamleader");
const teamMemberId = users.get("demo_teammember");
const { data: team, error: teamError } = await supabase
  .from("teams")
  .upsert(
    { manager_id: teamManagerId, team_leader_id: teamLeaderId, created_by: teamManagerId },
    { onConflict: "team_leader_id" },
  )
  .select("id")
  .single();
if (teamError) throw new Error(`Could not create the demo team: ${teamError.message}`);

const { error: assignmentError } = await supabase
  .from("staff")
  .update({
    team_id: team.id,
    manager_id: teamManagerId,
    team_leader_id: teamLeaderId,
    team_lead: teamLeaderId,
  })
  .eq("id", teamMemberId);
if (assignmentError)
  throw new Error(`Could not assign the demo team member: ${assignmentError.message}`);

console.log(`Created or updated ${roles.length} active demo hierarchy accounts.`);
