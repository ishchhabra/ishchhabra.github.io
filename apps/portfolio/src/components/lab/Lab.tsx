import type { ReactNode } from "react";
import { getProjectBySlug } from "../../lib/projects";
import { BackLink } from "../core/BackLink";
import { Page } from "../Page";

function LabHeader({ slug }: { slug: string }) {
  const project = getProjectBySlug(slug);
  if (!project) return null;

  const pageDescription = project.longDescription ?? project.description;

  return (
    <header className="max-w-4xl pb-8">
      <BackLink to="/lab">Lab</BackLink>
      <Page.Hero title={project.title} viewTransitionName={`lab-${slug}-title`}>
        <p
          className="mb-6 text-lg leading-relaxed text-zinc-600 dark:text-zinc-500"
          style={{ viewTransitionName: `lab-${slug}-description` }}
        >
          {pageDescription}
        </p>
      </Page.Hero>
    </header>
  );
}

function LabLayout({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Page.Main variant="hero">
      <LabHeader slug={slug} />
      {children}
    </Page.Main>
  );
}

export const Lab = {
  Header: LabHeader,
  Layout: LabLayout,
};
