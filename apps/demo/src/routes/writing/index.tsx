import { createFileRoute } from "@tanstack/react-router";
import { Writing } from "../../pages/Writing";

export const Route = createFileRoute("/writing/")({
  component: Writing,
});
