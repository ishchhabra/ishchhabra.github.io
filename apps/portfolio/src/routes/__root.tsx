/// <reference types="vite/client" />

import { createRootRoute, HeadContent, Outlet, Scripts, useLocation } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import appCss from "../index.css?url";
import {
  createPageMeta,
  createWebsiteSchemaScript,
  DEFAULT_DESCRIPTION,
  SITE_TITLE,
} from "../lib/seo";
import { getThemeForClientNav, getThemeServerFn, ThemeProvider, useTheme } from "../lib/theme";

export const Route = createRootRoute({
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      return { theme: await getThemeServerFn() };
    }

    return { theme: getThemeForClientNav() };
  },
  head: () => {
    const base = createPageMeta({
      title: SITE_TITLE,
      description: DEFAULT_DESCRIPTION,
      // Do not set path/canonical here — each leaf route sets its own canonical.
      // Otherwise root + child merge produces two canonical tags.
    });

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1.0" },
        ...base.meta,
        { property: "og:type", content: "website" },
      ],
      scripts: [createWebsiteSchemaScript()],
      links: [
        ...(base.links ?? []),
        { rel: "alternate", type: "application/rss+xml", title: SITE_TITLE, href: "/api/feed" },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap",
        },
        { rel: "stylesheet", href: appCss },
      ],
    };
  },
  component: RootComponent,
});

/** Path prefix for standalone demo routes (bare layout, no Header/Footer). */
const DEMO_ROUTE_PREFIX = "/demos/";

/** Minimal document for demo route so iframe can show only the demo (no Header/Footer). */
function BareDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

function RootComponent() {
  const { pathname } = useLocation();
  const isDemoRoute = pathname.startsWith(DEMO_ROUTE_PREFIX);

  if (isDemoRoute) {
    return (
      <BareDocument>
        <Outlet />
      </BareDocument>
    );
  }

  return (
    <ThemeProvider>
      <RootDocument>
        <LayoutShell>
          <Outlet />
        </LayoutShell>
      </RootDocument>
    </ThemeProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const { theme } = useTheme();

  return (
    <html className={theme} lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

function LayoutShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="relative flex min-h-svh flex-col bg-white dark:bg-zinc-950">
      <div
        className="pointer-events-none fixed inset-0 opacity-0 dark:opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59, 130, 246, 0.08), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(139, 92, 246, 0.04), transparent)",
        }}
      />

      <Header />
      <div className="relative flex-1">{children}</div>
      <Footer />
    </div>
  );
}
