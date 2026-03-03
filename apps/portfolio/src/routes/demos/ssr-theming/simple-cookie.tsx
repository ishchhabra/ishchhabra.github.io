import "@iframe-resizer/child";
import { createFileRoute, useRouteContext, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Preview } from "../../../components/writing/core/Preview";
import { createPageMeta } from "../../../lib/seo";

const DESCRIPTION =
  "SSR theming demo: cookie-based theme — no flash, toggle waits for server (setThemeServerFn + getThemeServerFn).";

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

export const Route = createFileRoute("/demos/ssr-theming/simple-cookie")({
  beforeLoad: async () => ({ theme: await getThemeServerFn() }),
  head: () =>
    createPageMeta({
      title: "Simple cookie theme demo | Ish Chhabra",
      description: DESCRIPTION,
      path: "/demos/ssr-theming/simple-cookie",
    }),
  component: SimpleCookieDemo,
});

function SimpleCookieDemo() {
  const { theme } = useRouteContext({ from: "/demos/ssr-theming/simple-cookie" });
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  // oxlint false positive: set-state-in-effect flags valid set-state-in-effect use
  /* oxlint-disable react-hooks-js/set-state-in-effect */
  useEffect(() => {
    setHydrated(true);
  }, []);
  /* oxlint-enable react-hooks-js/set-state-in-effect */

  const toggleTheme = async () => {
    if (theme === null) return;
    const next: Theme = theme === "dark" ? "light" : "dark";
    await setThemeServerFn({ data: next });
    await router.invalidate();
  };

  if (theme === null) {
    return (
      <Preview.ThemeShell theme={DEFAULT_THEME}>
        <Preview.NavBar
          pages={["Home", "About"]}
          current="Home"
          onNav={() => {}}
          themeToggle={<Preview.ThemeToggle theme={DEFAULT_THEME} onToggle={() => {}} disabled />}
        />
        <Preview.PageContent>
          <Preview.LoremIpsum />
        </Preview.PageContent>
        <Preview.StatusBar variant="waiting">Loading theme (getThemeServerFn)…</Preview.StatusBar>
      </Preview.ThemeShell>
    );
  }

  return (
    <Preview.ThemeShell theme={theme}>
      <Preview.NavBar
        pages={["Home", "About"]}
        current="Home"
        onNav={() => {}}
        themeToggle={<Preview.ThemeToggle theme={theme} onToggle={toggleTheme} />}
      />
      <Preview.PageContent>
        <Preview.LoremIpsum />
      </Preview.PageContent>
      <Preview.StatusBar variant={hydrated ? "done" : "waiting"}>
        {hydrated
          ? `Loaded from server — theme: ${theme}`
          : "Server rendered (default theme). Loading…"}
      </Preview.StatusBar>
    </Preview.ThemeShell>
  );
}
