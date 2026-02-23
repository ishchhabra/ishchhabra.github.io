import { createFileRoute } from "@tanstack/react-router";
import { createPageMeta } from "../../lib/seo";
import { SandboxPlayground } from "../../pages/SandboxPlayground";

const DESCRIPTION =
  "Secure, sandboxed React rendering for AI-generated UI. CSP isolation, full hooks, zero host DOM access.";

export const Route = createFileRoute("/lab/sandbox")({
  head: () =>
    createPageMeta({
      title: "React Sandbox | Ish Chhabra",
      description: DESCRIPTION,
      path: "/lab/sandbox",
    }),
  component: SandboxPlayground,
});
