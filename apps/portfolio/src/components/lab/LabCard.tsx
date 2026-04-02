import { Link } from "@tanstack/react-router";
import { type LabProject, getProjectHref } from "../../lib/projects";

const tagStyles: Record<string, string> = {
  Experiment: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Research: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

const accentGradients: Record<string, string> = {
  emerald: "from-emerald-500/10 via-transparent to-transparent group-hover:from-emerald-500/15",
  blue: "from-blue-500/10 via-transparent to-transparent group-hover:from-blue-500/15",
  violet: "from-violet-500/10 via-transparent to-transparent group-hover:from-violet-500/15",
};

export function LabCard({ project }: { project: LabProject }) {
  const href = getProjectHref(project);
  const titleTransitionName = !project.external ? `lab-${project.slug}-title` : undefined;
  const descTransitionName = !project.external ? `lab-${project.slug}-description` : undefined;

  const cardLink = project.external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute inset-0 z-0"
      aria-label={project.title}
    />
  ) : (
    <Link to={href} className="absolute inset-0 z-0" aria-label={project.title} />
  );

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/80 p-7 transition-all duration-300 hover:border-zinc-300 hover:bg-zinc-100/80 dark:border-white/5 dark:bg-white/2 dark:hover:border-white/10 dark:hover:bg-white/4">
      {cardLink}
      <div
        className={`pointer-events-none absolute inset-0 bg-linear-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${accentGradients[project.accent] ?? ""}`}
      />
      <div className="pointer-events-none relative flex h-full flex-col">
        <div className="mb-1.5 flex items-center gap-2.5">
          <h3
            className="text-lg font-semibold text-zinc-900 dark:text-white"
            style={{
              fontFamily: "var(--font-display)",
              ...(titleTransitionName && {
                viewTransitionName: titleTransitionName,
              }),
            }}
          >
            {project.title}
          </h3>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${tagStyles[project.tag] ?? ""}`}
          >
            {project.tag}
          </span>
        </div>
        {project.links && project.links.length > 0 && (
          <div className="mb-3 flex items-center gap-1">
            {project.links.map((link, i) => (
              <span key={link.href} className="flex items-center">
                {i > 0 && <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">&middot;</span>}
                <a
                  href={link.href}
                  target={link.href.startsWith("/") ? undefined : "_blank"}
                  rel={link.href.startsWith("/") ? undefined : "noopener noreferrer"}
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto relative z-10 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-violet-500 hover:decoration-violet-400 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-violet-400 dark:hover:decoration-violet-400"
                >
                  {link.live ? (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-50" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" />
                    </span>
                  ) : (
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-60"
                      aria-hidden="true"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  )}
                  {link.label}
                </a>
              </span>
            ))}
          </div>
        )}
        <p
          className="mb-5 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400"
          style={descTransitionName ? { viewTransitionName: descTransitionName } : {}}
        >
          {project.description}
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors duration-300 group-hover:text-zinc-900 dark:group-hover:text-white">
          {project.external ? "View on GitHub" : "Try it"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </div>
    </div>
  );
}
