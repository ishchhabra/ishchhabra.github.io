import "@iframe-resizer/child";
import {
  createFileRoute,
  Outlet,
  useRouteContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { startTransition, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { z } from "zod";
import { Preview } from "../../../../components/writing/core/Preview";
import { createPageMeta } from "../../../../lib/seo";

const DESCRIPTION =
  "SSR theming demo: cookie-based theme with optimistic toggle and real navigation — beforeLoad runs on every nav (slow).";

const SERVER_DELAY_MS = 1000;
const STORAGE_KEY = "theme";

const themeSchema = z.enum(["light", "dark"]);
type Theme = z.infer<typeof themeSchema>;
const DEFAULT_THEME: Theme = "light";

const getThemeServerFn = createServerFn().handler(async (): Promise<Theme> => {
  await new Promise((resolve) => setTimeout(resolve, SERVER_DELAY_MS));
  const raw = getCookie(STORAGE_KEY) ?? "dark";
  const result = themeSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_THEME;
});

const setThemeServerFn = createServerFn()
  .inputValidator(themeSchema)
  .handler(async ({ data }) => {
    setCookie(STORAGE_KEY, data);
  });

const BASE = "/demos/ssr-theming/cookie-optimistic";

export const Route = createFileRoute("/demos/ssr-theming/cookie-optimistic")({
  beforeLoad: async () => ({ theme: await getThemeServerFn() }),
  head: () =>
    createPageMeta({
      title: "Cookie optimistic theme demo | Ish Chhabra",
      description: DESCRIPTION,
      path: BASE,
    }),
  component: CookieOptimisticLayout,
});

function CookieOptimisticLayout() {
  const { theme: serverTheme } = useRouteContext({ from: "/demos/ssr-theming/cookie-optimistic" });
  const router = useRouter();
  const { pathname } = useStableLocation();
  const [theme, setOptimisticTheme] = useOptimistic<Theme>(serverTheme);
  const requestRef = useRef(0);
  const [hydrated, setHydrated] = useState(false);

  // oxlint false positive: set-state-in-effect flags valid set-state-in-effect use
  // oxlint-disable-next-line react-hooks-js/set-state-in-effect
  useEffect(() => setHydrated(true), []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    const requestId = ++requestRef.current;
    startTransition(async () => {
      setOptimisticTheme(nextTheme);
      await setThemeServerFn({ data: nextTheme });
      if (requestId === requestRef.current) await router.invalidate();
    });
  };

  const current = pathname.endsWith("/about") ? "About" : "Home";

  if (theme === null) {
    return (
      <Preview.ThemeShell theme={DEFAULT_THEME}>
        <Preview.NavBar
          pages={["Home", "About"]}
          current={current}
          onNav={() => {}}
          themeToggle={<Preview.ThemeToggle theme={DEFAULT_THEME} onToggle={() => {}} disabled />}
          links={[
            { label: "Home", to: BASE },
            { label: "About", to: `${BASE}/about` },
          ]}
        />
        <Outlet />
        <Preview.StatusBar variant="waiting">Loading theme (getThemeServerFn)…</Preview.StatusBar>
      </Preview.ThemeShell>
    );
  }

  return (
    <Preview.ThemeShell theme={theme}>
      <Preview.NavBar
        pages={["Home", "About"]}
        current={current}
        onNav={() => {}}
        themeToggle={<Preview.ThemeToggle theme={theme} onToggle={toggleTheme} />}
        links={[
          { label: "Home", to: BASE },
          { label: "About", to: `${BASE}/about` },
        ]}
      />
      <Outlet />
      <Preview.StatusBar variant={hydrated ? "done" : "waiting"}>
        {hydrated
          ? `Loaded from server — theme: ${theme}`
          : "Server rendered (default theme). Loading…"}
      </Preview.StatusBar>
    </Preview.ThemeShell>
  );
}

export default function useStableLocation() {
  const { isLoading, resolvedLocation, location } = useRouterState({
    select: (state) => ({
      isLoading: state.isLoading,
      resolvedLocation: state.resolvedLocation?.pathname,
      location: state.location.pathname,
    }),
  });

  return useMemo(() => {
    const currentLocation = isLoading ? (resolvedLocation ?? location) : location;

    return {
      pathname: currentLocation,
    };
  }, [isLoading, resolvedLocation, location]);
}
