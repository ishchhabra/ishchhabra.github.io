import { createFileRoute } from "@tanstack/react-router";
import { createPageMeta } from "../../lib/seo";
import { DesignOverlayDemo } from "../../pages/DesignOverlayDemo";

const DESCRIPTION =
  "A development tool that lets you select any element on the page and edit it with AI — directly in the browser. Point, describe what you want, and watch it change.";

export const Route = createFileRoute("/lab/design-overlay")({
  head: () =>
    createPageMeta({
      title: "Design Overlay | Ish Chhabra",
      description: DESCRIPTION,
      path: "/lab/design-overlay",
    }),
  component: DesignOverlayDemo,
});
