/// <reference types="@types/node" />

import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";

export const auth = betterAuth({
  baseURL: process.env["BETTER_AUTH_URL"],
  database: new Pool({
    connectionString: process.env["DATABASE_URL"] as string,
  }),
  socialProviders: {
    google: {
      clientId: process.env["GOOGLE_CLIENT_ID"] as string,
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"] as string,
    },
  },
  plugins: [tanstackStartCookies()],
});
