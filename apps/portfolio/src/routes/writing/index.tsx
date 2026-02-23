import { createFileRoute } from "@tanstack/react-router";
import { createPageMeta } from "../../lib/seo";
import { Writing } from "../../pages/Writing";

const WRITING_DESCRIPTION = "Things I wish someone had explained to me.";

export const Route = createFileRoute("/writing/")({
  head: () =>
    createPageMeta({
      title: "Writing | Ish Chhabra",
      description: WRITING_DESCRIPTION,
      path: "/writing",
    }),
  component: Writing,
});
