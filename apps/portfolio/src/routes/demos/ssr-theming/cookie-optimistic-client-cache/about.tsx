import { createFileRoute } from "@tanstack/react-router";
import { Preview } from "../../../../components/writing/core/Preview";

export const Route = createFileRoute("/demos/ssr-theming/cookie-optimistic-client-cache/about")({
  component: CookieOptimisticClientCacheAbout,
});

function CookieOptimisticClientCacheAbout() {
  return (
    <Preview.PageContent>
      <Preview.LoremIpsum title="About" />
    </Preview.PageContent>
  );
}
