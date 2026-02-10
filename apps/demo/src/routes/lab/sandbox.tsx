import { createFileRoute } from "@tanstack/react-router";
import { SandboxPlayground } from "../../pages/SandboxPlayground";

export const Route = createFileRoute("/lab/sandbox")({
  component: SandboxPlayground,
});
