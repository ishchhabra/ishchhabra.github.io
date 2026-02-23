import { Link } from "@tanstack/react-router";
import { Page } from "./Page";

export function NotFound() {
  return (
    <Page.Main variant="default">
      <section className="py-16">
        <Page.Hero title="Not found" />
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          This page doesn’t exist or has been moved.
        </p>
        <Link
          to="/"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white"
        >
          Back to home
        </Link>
      </section>
    </Page.Main>
  );
}
