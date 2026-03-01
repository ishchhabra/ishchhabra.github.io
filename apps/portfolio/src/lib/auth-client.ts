import { createAuthClient } from "better-auth/react";

export const { useSession, signIn, signOut, getSession } = createAuthClient({
  baseURL: process.env["BETTER_AUTH_URL"] as string,
});
