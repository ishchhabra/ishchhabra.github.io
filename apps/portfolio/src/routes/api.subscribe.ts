import { createFileRoute } from "@tanstack/react-router";
import * as z from "zod/mini";
import { getDb } from "../lib/db";
import { subscribers } from "../lib/db/schema";

const subscribeSchema = z.object({
  email: z.email(),
});

export const Route = createFileRoute("/api/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = await request.json();
          const result = z.safeParse(subscribeSchema, body);

          if (!result.success) {
            return new Response(JSON.stringify({ error: "Please enter a valid email address" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const email = result.data.email.trim().toLowerCase();

          const db = getDb();
          await db
            .insert(subscribers)
            .values({ email })
            .onConflictDoNothing({ target: subscribers.email });

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ error: "Something went wrong. Try again later." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
