import { Overlay } from "@i2-labs/design-overlay";
import { Page } from "../components/Page";
import { Surface } from "../components/Surface";

export function DesignOverlayDemo() {
  return (
    <>
      <Page.Main>
        {/* Hero explanation */}
        <div className="mb-12">
          <Page.Hero
            title="Design Overlay"
            accentLine={false}
            viewTransitionName="lab-design-overlay-title"
          >
            <p
              className="mb-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400"
              style={{ viewTransitionName: "lab-design-overlay-description" }}
            >
              A development tool that lets you select any element on the page and edit it with AI —
              directly in the browser. No switching between code and preview. Point, describe what
              you want, and watch it change.
            </p>
          </Page.Hero>

          <Surface className="p-6">
            <h2
              className="mb-4 text-base font-semibold text-zinc-900 dark:text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              How to use it
            </h2>
            <ol className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                  1
                </span>
                <span>
                  Click the{" "}
                  <span className="inline-flex items-center gap-1 rounded bg-zinc-200 px-1.5 py-0.5 font-medium text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                    </svg>
                    cursor
                  </span>{" "}
                  toggle at the bottom center of the screen to activate the overlay.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                  2
                </span>
                <span>
                  Hover over any element — you'll see a blue outline highlighting it. Click to
                  select.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                  3
                </span>
                <span>
                  Describe what you want to change in natural language. The AI edits the element's
                  styles and content in real time.
                </span>
              </li>
            </ol>
          </Surface>
        </div>

        {/* Divider */}
        <div className="mb-10 flex items-center gap-4">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-white/5" />
          <span className="text-xs font-medium tracking-widest text-zinc-500 uppercase dark:text-zinc-600">
            Demo content below — try editing it
          </span>
          <div className="h-px flex-1 bg-zinc-200 dark:bg-white/5" />
        </div>

        {/* Sample content for the overlay to interact with */}
        <article className="mb-10">
          <h2
            className="mb-4 text-2xl font-bold text-zinc-900 dark:text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The quick brown fox
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
            incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
            exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure
            dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
          </p>
          <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
            mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit
            voluptatem accusantium doloremque laudantium, totam rem aperiam.
          </p>
        </article>

        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <Surface className="p-6">
            <h3 className="mb-2 text-base font-semibold text-zinc-900 dark:text-white">Card one</h3>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              This is a sample card. Select it with the overlay and ask the AI to change its
              background, text, layout — anything.
            </p>
          </Surface>
          <Surface className="p-6">
            <h3 className="mb-2 text-base font-semibold text-zinc-900 dark:text-white">Card two</h3>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Another sample card. Try asking the AI to make this one stand out, add a border color,
              or restyle the typography.
            </p>
          </Surface>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Sample button
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white"
          >
            Another button
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Blue button
          </button>
        </div>
      </Page.Main>

      <Overlay />
    </>
  );
}
