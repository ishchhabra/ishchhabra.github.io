import "@iframe-resizer/child";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DelayedHydration } from "../../../components/writing/core/DelayedHydration";
import { Preview } from "../../../components/writing/core/Preview";
import { createPageMeta } from "../../../lib/seo";

const DESCRIPTION =
  "SSR theming demo: theme from localStorage — server renders default, then client hydrates after a delay (simulated flash).";

const SERVER_DELAY_MS = 1000;
const STORAGE_KEY = "theme";

type Theme = "light" | "dark";
const DEFAULT_THEME: Theme = "light";

export const Route = createFileRoute("/demos/ssr-theming/simple-local-storage")({
  head: () =>
    createPageMeta({
      title: "Simple localStorage theme demo | Ish Chhabra",
      description: DESCRIPTION,
      path: "/demos/ssr-theming/simple-local-storage",
    }),
  component: SimpleLocalStorageDemoPage,
});

function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored ?? DEFAULT_THEME;
}

export function SimpleLocalStorageDemoInner() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [hydrated, setHydrated] = useState(false);

  // oxlint false positive: set-state-in-effect flags valid set-state-in-effect use
  /* oxlint-disable react-hooks-js/set-state-in-effect */
  useEffect(() => {
    setTheme(getStoredTheme());
    setHydrated(true);
  }, []);
  /* oxlint-enable react-hooks-js/set-state-in-effect */

  const toggleTheme = () => {
    const themes = ["light", "dark"] as const;
    const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length]!;
    setTheme(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
  };

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
          ? `Client hydrated — theme: ${theme}`
          : "Server rendered (default theme). Loading…"}
      </Preview.StatusBar>
    </Preview.ThemeShell>
  );
}

function SimpleLocalStorageDemoPage() {
  return (
    <DelayedHydration
      modulePath="../../../routes/demos/ssr-theming/simple-local-storage.tsx"
      exportName="SimpleLocalStorageDemoInner"
      delay={SERVER_DELAY_MS}
    />
  );
}
