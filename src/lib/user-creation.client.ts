import { supabase } from "@/integrations/supabase/client";

export async function postUserCreation<T>(path: string, data: unknown): Promise<T> {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
  if (!authData.session) throw new Error("Sign in before creating a user.");

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authData.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("The user-creation endpoint returned an invalid response.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("The user-creation endpoint returned an invalid response.");
  if (!response.ok) {
    const message = "error" in result && typeof result.error === "string" ? result.error : null;
    throw new Error(message ?? "User creation failed.");
  }
  return result as T;
}
