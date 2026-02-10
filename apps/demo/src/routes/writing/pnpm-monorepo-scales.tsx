import { createFileRoute } from "@tanstack/react-router";
import { PnpmMonorepoArticle } from "../../pages/writing/PnpmMonorepoArticle";

export const Route = createFileRoute("/writing/pnpm-monorepo-scales")({
  component: PnpmMonorepoArticle,
});
