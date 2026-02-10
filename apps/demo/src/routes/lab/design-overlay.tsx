import { createFileRoute } from "@tanstack/react-router";
import { DesignOverlayDemo } from "../../pages/DesignOverlayDemo";

export const Route = createFileRoute("/lab/design-overlay")({
  component: DesignOverlayDemo,
});
