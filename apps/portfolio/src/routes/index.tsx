import { createFileRoute } from "@tanstack/react-router";
import { createPageMeta, DEFAULT_DESCRIPTION, SITE_TITLE } from "../lib/seo";
import { Home } from "../pages/Home";

export const Route = createFileRoute("/")({
  head: () =>
    createPageMeta({
      title: SITE_TITLE,
      description: DEFAULT_DESCRIPTION,
      path: "/",
    }),
  component: Home,
});
