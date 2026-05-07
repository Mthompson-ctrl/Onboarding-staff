"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

export type LoginState = {
  error?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
  };
};

// Single generic message for any auth-related failure. Don't differentiate
// "no such email" from "wrong password" — that leaks which addresses have
// accounts.
const GENERIC_AUTH_ERROR = "Email or password is incorrect.";
const GENERIC_SERVER_ERROR =
  "Something went wrong. Please try again in a moment.";

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "email" && !fieldErrors.email) fieldErrors.email = issue.message;
      if (key === "password" && !fieldErrors.password)
        fieldErrors.password = issue.message;
    }
    return { fieldErrors };
  }

  let signInFailed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) signInFailed = true;
  } catch (err) {
    console.error("login: signInWithPassword threw", err);
    return { error: GENERIC_SERVER_ERROR };
  }

  if (signInFailed) {
    return { error: GENERIC_AUTH_ERROR };
  }

  // redirect() throws a NEXT_REDIRECT signal — must be outside the try/catch
  // so Next can handle it. Successful sign-in goes to the portal.
  redirect("/portal");
}
