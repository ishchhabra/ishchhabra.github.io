import { createFileRoute } from "@tanstack/react-router";
import { Preview } from "../../../../components/writing/core/Preview";

export const Route = createFileRoute("/demos/ssr-theming/cookie-optimistic/")({
  component: CookieOptimisticIndex,
});

function CookieOptimisticIndex() {
  return (
    <Preview.PageContent>
      <Preview.LoremIpsum title="Home" />
    </Preview.PageContent>
  );
}
