import type { ReactNode } from "react";

/** Page shell: relative mx-auto max-w-7xl px-6 py-10 */
function PageMain({ children }: { children: ReactNode }) {
  return <main className="relative mx-auto max-w-7xl px-6 py-10">{children}</main>;
}

/**
 * Optional inner wrapper for hero layouts. Use inside PageMain.
 * Adds pt-20 pb-24 sm:pt-28, cancels PageMain's padding via negative margins.
 */
function PageHero({ children }: { children: ReactNode }) {
  return <div className="-mb-10 -mt-10 pt-20 pb-24 sm:pt-28">{children}</div>;
}

export const Page = {
  Main: PageMain,
  Hero: PageHero,
};
