import { useRouteContext, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import {
  type ReactNode,
  createContext,
  startTransition,
  useContext,
  useOptimistic,
  useRef,
} from "react";
import { z } from "zod";

const storageKey = "theme";

const themeSchema = z.enum(["light", "dark"]);
export type Theme = z.infer<typeof themeSchema>;

export const getThemeServerFn = createServerFn().handler((): Theme => {
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

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    const requestId = ++requestRef.current;

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

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
