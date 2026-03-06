import { useRouteContext, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import {
  type ReactNode,
  createContext,
  startTransition,
  useContext,
  useEffect,
  useOptimistic,
  useRef,
} from "react";
import { z } from "zod";

const storageKey = "theme";

const themeSchema = z.enum(["light", "dark"]);
export type Theme = z.infer<typeof themeSchema>;

// Client-only cache so root beforeLoad can return theme without calling the server on nav
let clientThemeCache: Theme = "dark";

export function getThemeForClientNav(): Theme {
  return clientThemeCache;
}

export function setThemeForClientNav(theme: Theme): void {
  clientThemeCache = theme;
}

export const getThemeServerFn = createServerFn().handler(async (): Promise<Theme> => {
  const raw = getCookie(storageKey) ?? "dark";
  const result = themeSchema.safeParse(raw);
  return result.success ? result.data : "dark";
});

export const setThemeServerFn = createServerFn()
  .inputValidator(themeSchema)
  .handler(async ({ data }) => {
    setCookie(storageKey, data);
  });

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { theme: serverTheme } = useRouteContext({ from: "__root__" });
  const router = useRouter();
  const [theme, setOptimisticTheme] = useOptimistic(serverTheme);
  const requestRef = useRef(0);

  useEffect(() => {
    setThemeForClientNav(serverTheme);
  }, [serverTheme]);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    const requestId = ++requestRef.current;
    setThemeForClientNav(nextTheme);

    startTransition(async () => {
      setOptimisticTheme(nextTheme);
      await setThemeServerFn({ data: nextTheme });

      if (requestId === requestRef.current) {
        await router.invalidate();
      }
    });
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

/** Lightweight provider for non-interactive rendering (e.g. RSS). No Router dependency. */
export function StaticThemeProvider({
  theme = "light",
  children,
}: {
  theme?: Theme;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
