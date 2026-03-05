import IframeResizer from "@iframe-resizer/react";
import { useState } from "react";
import { Page } from "../../components/Page";
import { Article } from "../../components/writing/core/Article";
import { Preview } from "../../components/writing/core/Preview";
import {
  A,
  Callout,
  Code,
  CodeBlock,
  Divider,
  ExpandableCodeBlock,
  H2,
  H3,
  LI,
  P,
  SectionLabel,
  Strong,
  UL,
} from "../../components/writing/core/Prose";
import { ScrollProgress } from "../../components/writing/core/ScrollProgress";
import { TableOfContents } from "../../components/writing/core/TableOfContents";

const DEMO_ROUTE_SIMPLE_LOCAL_STORAGE = "/demos/ssr-theming/simple-local-storage";
const DEMO_ROUTE_SIMPLE_COOKIE = "/demos/ssr-theming/simple-cookie";
const DEMO_ROUTE_COOKIE_OPTIMISTIC = "/demos/ssr-theming/cookie-optimistic";
const DEMO_ROUTE_COOKIE_OPTIMISTIC_CLIENT_CACHE =
  "/demos/ssr-theming/cookie-optimistic-client-cache";

function DemoEmbed({ url, title }: { url: string; title: string }) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  return (
    <Preview.BrowserChrome url={url} onRefresh={() => setRefreshTrigger((t) => t + 1)}>
      <IframeResizer
        key={refreshTrigger}
        className="w-full"
        license="GPLv3"
        src={url}
        title={title}
      />
    </Preview.BrowserChrome>
  );
}

const tocItems = [
  {
    id: "where-should-we-persist-the-theme-preference-in-an-ssr-app",
    label: "Where should we persist the theme preference in an SSR app?",
  },
  {
    id: "storing-it-in-local-storage",
    label: "Storing it in localStorage",
    indent: true,
  },
  { id: "storing-it-in-cookies", label: "Storing it in cookies", indent: true },
  { id: "why-is-the-toggle-slow", label: "Why is the toggle slow?" },
  { id: "why-is-navigation-slow", label: "Why is navigation slow?" },
  { id: "full-implementation", label: "Full implementation" },
  { id: "references", label: "References" },
];

export function SsrThemingArticle() {
  return (
    <>
      <ScrollProgress />
      <Page.Main variant="hero">
        <Article.Header slug="ssr-theming" writtenWithAI />

        <div className="flex gap-10 pt-8">
          <article className="min-w-0 max-w-4xl flex-1">
            {/* ── PERSISTING THE THEME ──────────────────────── */}

            <SectionLabel>The problem</SectionLabel>
            <H2 id="where-should-we-persist-the-theme-preference-in-an-ssr-app">
              Where should we persist the theme preference in an SSR app?
            </H2>

            <P>
              Implementing dark mode often seems like a trivial feature. In practice, it turns out
              to be surprisingly tricky in server-rendered applications.
            </P>
            <P>
              In a purely client-side app, persisting the theme preference is straightforward: store
              the value somewhere in the browser like <Code>localStorage</Code> and read it again
              when the app loads. However, doing the same in an SSR app comes with a catch.
            </P>

            <H3 id="storing-it-in-local-storage">Storing it in localStorage</H3>

            <P>
              Naturally, the first step is to reach for the same approach that works in a
              client-side app: persist the theme in <Code>localStorage</Code>.
            </P>

            <CodeBlock filename="theme.tsx" language="tsx">{`const STORAGE_KEY = "theme";

type Theme = "light" | "dark";
const DEFAULT_THEME: Theme = "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(
    () => (localStorage.getItem(STORAGE_KEY) as Theme) ?? DEFAULT_THEME
  );

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}`}</CodeBlock>

            <P>
              There's a problem though — the server has no <Code>localStorage</Code>, so this throws
              an error immediately.
            </P>

            <Callout type="danger">
              <span className="font-medium">ReferenceError: localStorage is not defined</span>
              <br />
              <span className="text-xs opacity-90">at ThemeProvider (theme.tsx:7:30)</span>
            </Callout>

            <P>
              To fix it, we need to guard the read from <Code>localStorage</Code> with{" "}
              <Code>typeof window !== &quot;undefined&quot;</Code>. This way, the server falls back
              to the default theme and only the browser reads from <Code>localStorage</Code>:
            </P>

            <ExpandableCodeBlock
              filename="theme.tsx"
              language="tsx"
              diff
              preview={`  const [theme, setTheme] = useState<Theme>(
-   () => (localStorage.getItem(STORAGE_KEY) as Theme) ?? DEFAULT_THEME
+   () =>
+     typeof window !== "undefined"
+       ? (localStorage.getItem(STORAGE_KEY) as Theme) ?? DEFAULT_THEME
+       : DEFAULT_THEME
  );`}
              full={`const STORAGE_KEY = "theme";

type Theme = "light" | "dark";
const DEFAULT_THEME: Theme = "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () =>
      typeof window !== "undefined"
        ? (localStorage.getItem(STORAGE_KEY) as Theme) ?? DEFAULT_THEME
        : DEFAULT_THEME
  );

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}`}
            />

            <P>Try it: switch to dark mode, then refresh the page.</P>

            <DemoEmbed
              url={DEMO_ROUTE_SIMPLE_LOCAL_STORAGE}
              title="Simple localStorage theme demo"
            />

            <P>
              If you refreshed, you likely saw the page flash light for a moment before switching to
              dark. That happens because the server sends the initial HTML before any JavaScript
              runs — it has no access to <Code>localStorage</Code>, so it always renders the default
              theme. By the time the client loads and reads your stored preference, the user has
              already seen the wrong one.
            </P>

            <P>
              To fix this, the server needs to know the theme before it sends the initial HTML.
              Since the server can't read localStorage, we need to store it somewhere it can read —
              cookies.
            </P>

            {/* ── COOKIE APPROACH ──────────────────────────── */}

            <H3 id="storing-it-in-cookies">Storing it in cookies</H3>

            <P>
              Cookies are sent with every HTTP request, so the server can read them before rendering
              anything. Here's how we can do that in TanStack Start:
            </P>

            <CodeBlock
              filename="theme.tsx"
              language="tsx"
            >{`import { useRouteContext, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { type ReactNode, createContext, useContext } from "react";
import { z } from "zod";

const storageKey = "theme";
const themeSchema = z.enum(["light", "dark"]);
export type Theme = z.infer<typeof themeSchema>;

export const getThemeServerFn = createServerFn()
  .handler((): Theme => {
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme: serverTheme } = useRouteContext({ from: "__root__" });
  const router = useRouter();

  const toggleTheme = async () => {
    const next: Theme = serverTheme === "dark" ? "light" : "dark";
    await setThemeServerFn({ data: next });
    await router.invalidate();
  };

  return (
    <ThemeContext.Provider value={{ theme: serverTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}`}</CodeBlock>

            <CodeBlock filename="__root.tsx" language="tsx">{`export const Route = createRootRoute({
  beforeLoad: async () => ({
    theme: await getThemeServerFn(),
  }),
  // ...
});`}</CodeBlock>

            <P>
              The server reads the cookie, sets the correct class on <Code>{"<html>"}</Code>, and
              the first paint matches the user's preference. No flash. (Later we'll add a client
              cache so client-side navigations don't refetch the theme; this is the minimal
              version.)
            </P>

            <P>
              Try it: toggle the theme and refresh the page. The correct theme appears on first load
              with no flash.
            </P>

            <DemoEmbed url={DEMO_ROUTE_SIMPLE_COOKIE} title="Simple cookie theme demo" />

            <Divider />

            {/* ── SLOW TOGGLE ──────────────────────────────── */}

            <H2 id="why-is-the-toggle-slow">Why is the toggle slow?</H2>

            <P>
              If you tried toggling in the demo above, you likely noticed that it's not instant.
              There's a delay between when you click the toggle and when the theme changes. That's
              because every toggle has to wait for two server round-trips before the UI updates.
            </P>

            <UL>
              <LI>
                <Code>setThemeServerFn</Code> writes the new value to the cookie on the server.
              </LI>
              <LI>
                <Code>router.invalidate()</Code> re-runs <Code>beforeLoad</Code>, which calls{" "}
                <Code>getThemeServerFn()</Code> to read the updated cookie.
              </LI>
            </UL>

            <P>
              To make the toggle feel instant, we can optimistically apply the new theme before the
              server responds.
            </P>

            <ExpandableCodeBlock
              filename="theme.tsx"
              language="tsx"
              diff
              preview={`export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme: serverTheme } = useRouteContext({ from: "__root__" });
  const router = useRouter();
+  const [theme, setOptimisticTheme] = useOptimistic(serverTheme);
+  const requestRef = useRef(0);

-  const toggleTheme = async () => {
-    const next: Theme = serverTheme === "dark" ? "light" : "dark";
-    await setThemeServerFn({ data: next });
-    await router.invalidate();
-  };
+  const toggleTheme = () => {
+    const next: Theme = theme === "dark" ? "light" : "dark";
+    const id = ++requestRef.current;
+    startTransition(async () => {
+      setOptimisticTheme(next);
+      await setThemeServerFn({ data: next });
+      if (id === requestRef.current) await router.invalidate();
+    });
+  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}`}
              full={`import { useRouteContext, useRouter } from "@tanstack/react-router";
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

export const getThemeServerFn = createServerFn()
  .handler((): Theme => {
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme: serverTheme } = useRouteContext({ from: "__root__" });
  const router = useRouter();
  const [theme, setOptimisticTheme] = useOptimistic(serverTheme);
  const requestRef = useRef(0);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const id = ++requestRef.current;
    startTransition(async () => {
      setOptimisticTheme(next);
      await setThemeServerFn({ data: next });
      if (id === requestRef.current) await router.invalidate();
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}`}
            />

            <P>
              <Code>setOptimisticTheme(next)</Code> updates the UI immediately. The server write and
              invalidation happen in the background. If the server call fails, the optimistic value
              rolls back to <Code>serverTheme</Code> automatically. The <Code>requestRef</Code>{" "}
              guard ensures we only call <Code>router.invalidate()</Code> if this request is still
              the latest — so rapid toggles don't let an older response overwrite the theme. The
              toggle is instant now.
            </P>

            <P>Try it: the toggle should feel instant.</P>

            <DemoEmbed url={DEMO_ROUTE_COOKIE_OPTIMISTIC} title="Cookie optimistic theme demo" />

            <P>But there's another problem. Try navigating.</P>

            <Divider />

            {/* ── SLOW NAVIGATION ──────────────────────────── */}

            <H2 id="why-is-navigation-slow">Why is navigation slow?</H2>

            <P>
              In the demo above, the toggle is instant. But click between Home and About — every
              navigation takes about a second. The app isn't re-rendering on the server — it's
              waiting for a single string.
            </P>

            <P>
              Here's why. In TanStack Start, <Code>beforeLoad</Code> runs on the{" "}
              <Strong>server</Strong> for the initial request and on the <Strong>client</Strong> for
              every subsequent navigation. When it runs on the client,{" "}
              <Code>getThemeServerFn()</Code> is still a server function — it makes a network
              request back to the server. The route can't finish loading until that request
              resolves. Every link click, every back button, every forward navigation pays this
              cost.
            </P>

            <P>
              Think of it like hydration. On the initial page load, the server sends the theme with
              the HTML — the client needs that to render correctly. But after hydration, the client
              already knows the theme. It's right there in memory. There's no reason to ask the
              server for it again. After the first load, this should behave like a SPA.
            </P>

            <P>
              To make navigation instant, cache the theme on the client and read from it in{" "}
              <Code>beforeLoad</Code> when we're in the browser. Store the theme in a module-level
              variable; have <Code>beforeLoad</Code> check <Code>typeof window</Code>: on the
              server, call the server function; on the client, return the cached value. No network
              request.
            </P>

            <ExpandableCodeBlock
              filename="theme.tsx"
              language="tsx"
              diff
              preview={`const themeSchema = z.enum(["light", "dark"]);
export type Theme = z.infer<typeof themeSchema>;

+ // ── Client cache ──────────────────────────────────────
+ let clientThemeCache: Theme = "dark";
+ export function getThemeForClientNav(): Theme {
+   return clientThemeCache;
+ }
+ export function setThemeForClientNav(theme: Theme): void {
+   clientThemeCache = theme;
+ }
+
// ── Server functions ──────────────────────────────────
export const getThemeServerFn = createServerFn()
  .handler((): Theme => { ... });

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { theme: serverTheme } = useRouteContext({ from: "__root__" });
  const router = useRouter();
  const [theme, setOptimisticTheme] = useOptimistic(serverTheme);
  const requestRef = useRef(0);

+  useEffect(() => {
+    setThemeForClientNav(serverTheme);
+  }, [serverTheme]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const id = ++requestRef.current;
+    setThemeForClientNav(next);
    startTransition(async () => {
      setOptimisticTheme(next);
      await setThemeServerFn({ data: next });
      if (id === requestRef.current) await router.invalidate();
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}`}
              full={`import { useRouteContext, useRouter } from "@tanstack/react-router";
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

// ── Client cache ──────────────────────────────────────
let clientThemeCache: Theme = "dark";
export function getThemeForClientNav(): Theme {
  return clientThemeCache;
}
export function setThemeForClientNav(theme: Theme): void {
  clientThemeCache = theme;
}

// ── Server functions ──────────────────────────────────
export const getThemeServerFn = createServerFn()
  .handler((): Theme => {
    const raw = getCookie(storageKey) ?? "dark";
    const result = themeSchema.safeParse(raw);
    return result.success ? result.data : "dark";
  });

export const setThemeServerFn = createServerFn()
  .inputValidator(themeSchema)
  .handler(async ({ data }) => {
    setCookie(storageKey, data);
  });

// ── Provider ──────────────────────────────────────────
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
    const next: Theme = theme === "dark" ? "light" : "dark";
    const id = ++requestRef.current;
    setThemeForClientNav(next);
    startTransition(async () => {
      setOptimisticTheme(next);
      await setThemeServerFn({ data: next });
      if (id === requestRef.current) await router.invalidate();
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}`}
            />

            <P>
              The root route's <Code>beforeLoad</Code> calls the server on the initial request and
              the cache on the client:
            </P>

            <CodeBlock filename="__root.tsx" language="tsx">{`beforeLoad: async () => {
  if (typeof window === "undefined") {
    return { theme: await getThemeServerFn() };
  }
  return { theme: getThemeForClientNav() };
},`}</CodeBlock>

            <P>
              The demo below uses the client cache: on the client, <Code>beforeLoad</Code> calls{" "}
              <Code>getThemeForClientNav()</Code> instead of the server, so navigation is instant.
              Click between Home and About and compare with the previous demo (cookie-optimistic).
            </P>

            <DemoEmbed
              url={DEMO_ROUTE_COOKIE_OPTIMISTIC_CLIENT_CACHE}
              title="Cookie optimistic + client cache (instant nav)"
            />

            <Divider />

            {/* ── FULL CODE ────────────────────────────────── */}

            <SectionLabel>Putting it together</SectionLabel>
            <H2 id="full-implementation">Full implementation</H2>

            <P>
              Two files. The theme module with server functions, client cache, and React context:
            </P>

            <CodeBlock
              filename="src/lib/theme.tsx"
              language="tsx"
            >{`import { useRouteContext, useRouter } from "@tanstack/react-router";
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

// ── Client cache ──────────────────────────────────────────
let clientThemeCache: Theme = "dark";
export function getThemeForClientNav(): Theme {
  return clientThemeCache;
}
export function setThemeForClientNav(theme: Theme): void {
  clientThemeCache = theme;
}

// ── Server functions ──────────────────────────────────────
export const getThemeServerFn = createServerFn()
  .handler((): Theme => {
    const raw = getCookie(storageKey) ?? "dark";
    const result = themeSchema.safeParse(raw);
    return result.success ? result.data : "dark";
  });

export const setThemeServerFn = createServerFn()
  .inputValidator(themeSchema)
  .handler(async ({ data }) => {
    setCookie(storageKey, data);
  });

// ── Provider ──────────────────────────────────────────────
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
    const next: Theme = theme === "dark" ? "light" : "dark";
    const id = ++requestRef.current;
    setThemeForClientNav(next);

    startTransition(async () => {
      setOptimisticTheme(next);
      await setThemeServerFn({ data: next });
      if (id === requestRef.current) {
        await router.invalidate();
      }
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}`}</CodeBlock>

            <P>And the root route:</P>

            <CodeBlock filename="src/routes/__root.tsx" language="tsx">{`import {
  getThemeForClientNav,
  getThemeServerFn,
  ThemeProvider,
  useTheme,
} from "../lib/theme";

export const Route = createRootRoute({
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      return { theme: await getThemeServerFn() };
    }
    return { theme: getThemeForClientNav() };
  },
  // ...
});`}</CodeBlock>

            <Divider />

            {/* ── REFERENCES ───────────────────────────────── */}

            <H2 id="references">References</H2>
            <UL>
              <LI>
                <A href="https://tanstack.com/start/latest/docs/framework/react/guide/execution-model">
                  TanStack Start — Execution model
                </A>{" "}
                — how <Code>beforeLoad</Code> runs on server vs client
              </LI>
              <LI>
                <A href="https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr">
                  TanStack Start — Selective SSR
                </A>{" "}
                — controlling what runs on the server per route
              </LI>
              <LI>
                <A href="https://react.dev/reference/react/useOptimistic">React — useOptimistic</A>{" "}
                — optimistically update UI before a server response
              </LI>
            </UL>

            <Article.Footer />
          </article>

          <TableOfContents items={tocItems} />
        </div>
      </Page.Main>
    </>
  );
}
