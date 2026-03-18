import { createFileRoute } from "@tanstack/react-router";
import { createPageMeta } from "../../lib/seo";
import { Lab } from "../../pages/Lab";

const LAB_DESCRIPTION = "Experiments and research in frontend tooling.";

export const Route = createFileRoute("/lab/")({
  head: () =>
    createPageMeta({
      title: "Lab | Ish Chhabra",
      description: LAB_DESCRIPTION,
      path: "/lab",
    }),
  component: Lab,
});
