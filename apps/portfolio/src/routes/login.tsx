import { createFileRoute } from "@tanstack/react-router";
import { createPageMeta, SITE_TITLE } from "../lib/seo";
import { Login } from "../pages/Login";

export const Route = createFileRoute("/login")({
  head: () =>
    createPageMeta({
      title: `Log in | ${SITE_TITLE}`,
      description: "Sign in to your account.",
      path: "/login",
    }),
  component: Login,
});
