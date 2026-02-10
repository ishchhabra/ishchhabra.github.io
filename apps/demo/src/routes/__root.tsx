/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import appCss from "../index.css?url";
import { createPageMeta, DEFAULT_DESCRIPTION, SITE_TITLE } from "../lib/seo";

export const Route = createRootRoute({
  head: () => {
    const base = createPageMeta({
      title: SITE_TITLE,
      description: DEFAULT_DESCRIPTION,
      path: "/",
    });

    return {
      title: base.title,
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1.0" },
        ...base.meta,
        { property: "og:type", content: "website" },
      ],
      links: [
        ...(base.links ?? []),
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

function RootComponent() {
  return (
    <RootDocument>
      <LayoutShell>
        <Outlet />
      </LayoutShell>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
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
    <div className="relative flex min-h-svh flex-col bg-zinc-950">
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59, 130, 246, 0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(139, 92, 246, 0.06), transparent)",
        }}
      />

      <Header />
      <div className="relative flex-1">{children}</div>
      <Footer />
    </div>
  );
}
