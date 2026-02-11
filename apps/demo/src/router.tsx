import { createRouter } from "@tanstack/react-router";
import { NotFound } from "./components/NotFound";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultNotFoundComponent: NotFound,
    scrollRestoration: true,
    defaultViewTransition: {
      types: (info) => (info.pathChanged ? ["page"] : false),
    },
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
