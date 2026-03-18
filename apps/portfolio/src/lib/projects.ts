export type LabProject = {
  slug: string;
  title: string;
  /** Short description shown on cards. */
  description: string;
  /** Longer description shown on the project page. Falls back to `description` if omitted. */
  longDescription?: string;
  tag: "Experiment" | "Research";
  accent: "emerald" | "blue" | "violet";
  external?: boolean;
  /** External URL. For internal projects, href is derived from slug. */
  href?: string;
};

export const LAB_PROJECTS: LabProject[] = [
  {
    slug: "sandbox",
    title: "React Sandbox",
    description:
      "Secure, sandboxed React rendering for AI-generated UI. CSP isolation, full hooks, zero host DOM access.",
    longDescription:
      "Write React code and run it in an isolated iframe. CSP-enforced — no network access, no host DOM access. Full React with hooks and interactivity.",
    tag: "Experiment",
    accent: "emerald",
  },
  {
    slug: "design-overlay",
    title: "Design Overlay",
    description:
      "Point at any element, describe what you want in natural language, watch it change. AI-powered visual editing.",
    longDescription:
      "A development tool that lets you select any element on the page and edit it with AI — directly in the browser. No switching between code and preview. Point, describe what you want, and watch it change.",
    tag: "Experiment",
    accent: "blue",
  },
  {
    slug: "js-aot-transpiler",
    title: "JS AOT Transpiler",
    description:
      "Ahead-of-time compilation for non-hot-path JavaScript. Babel plugin, performance research.",
    tag: "Research",
    accent: "violet",
    external: true,
    href: "https://github.com/ishchhabra/babel-plugin-javascript-aot",
  },
];

const bySlug = new Map(LAB_PROJECTS.map((p) => [p.slug, p]));

export function getProjectBySlug(slug: string): LabProject | undefined {
  return bySlug.get(slug);
}

export function getProjectHref(project: LabProject): string {
  return project.external && project.href ? project.href : `/lab/${project.slug}`;
}
