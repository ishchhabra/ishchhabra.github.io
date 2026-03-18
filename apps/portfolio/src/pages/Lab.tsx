import { LabCard } from "../components/lab/LabCard";
import { Page } from "../components/Page";
import { LAB_PROJECTS } from "../lib/projects";

export function Lab() {
  return (
    <Page.Main variant="hero">
      <div className="max-w-3xl">
        <Page.Hero title="Lab">
          <p className="mb-14 text-lg text-zinc-600 dark:text-zinc-500">
            Things I built out of curiosity. May or may not work.
          </p>
        </Page.Hero>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LAB_PROJECTS.map((p) => (
          <LabCard key={p.title} project={p} />
        ))}
      </div>
    </Page.Main>
  );
}
