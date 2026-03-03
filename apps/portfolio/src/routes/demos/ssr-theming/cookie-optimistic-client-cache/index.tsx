import { createFileRoute } from "@tanstack/react-router";
import { Preview } from "../../../../components/writing/core/Preview";

export const Route = createFileRoute("/demos/ssr-theming/cookie-optimistic-client-cache/")({
  component: CookieOptimisticClientCacheIndex,
});

function CookieOptimisticClientCacheIndex() {
  return (
    <Preview.PageContent>
      <Preview.LoremIpsum title="Home" />
    </Preview.PageContent>
  );
}
