export type MaskableUser = {
  unique_id: string;
  role: string;
  team_id: string | null;
};

export type MaskedUser = Pick<MaskableUser, "unique_id" | "role" | "team_id">;

export function maskUserData<T extends MaskableUser>(
  user: T,
  currentUserRole: string,
): T | MaskedUser {
  const normalizedRole = currentUserRole.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalizedRole === "super_admin" || normalizedRole === "superadmin") return user;
  return {
    unique_id: user.unique_id,
    role: user.role,
    team_id: user.team_id,
  };
}
