import { useRouteContext, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
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

export function useTheme() {
  const { theme } = useRouteContext({ from: "__root__" });
  const router = useRouter();

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    void setThemeServerFn({ data: nextTheme }).then(() => router.invalidate());
  };

  return { theme, toggleTheme };
}
