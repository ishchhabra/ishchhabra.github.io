import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

const pageMainVariants = cva("relative mx-auto max-w-7xl px-6", {
  variants: {
    variant: {
      default: "py-10",
      hero: "pt-20 pb-24 sm:pt-28",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface PageMainProps extends VariantProps<typeof pageMainVariants> {
  children: ReactNode;
}

function PageMain({ children, variant = "default" }: PageMainProps) {
  return <main className={pageMainVariants({ variant })}>{children}</main>;
}

const pageHeroTitleClasses =
  "mb-4 text-3xl font-bold tracking-tight text-white sm:text-[42px] sm:leading-[1.15]";

interface PageHeroProps {
  title: string;
  /** Show accent line above title */
  accentLine?: boolean;
  children?: ReactNode;
}

function PageHero({ title, accentLine = true, children }: PageHeroProps) {
  return (
    <div>
      {accentLine && <div className="accent-line mb-6 h-px w-12" />}
      <h1 className={pageHeroTitleClasses} style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h1>
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  /** Optional action (e.g. "View all" link) rendered after the divider */
  action?: ReactNode;
}

function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex items-baseline gap-3">
      <h2
        className="text-xs font-medium tracking-widest text-zinc-500 uppercase"
        style={{ letterSpacing: "0.15em" }}
      >
        {title}
      </h2>
      <div className="h-px flex-1 bg-white/5" />
      {action}
    </div>
  );
}

export const Page = {
  Main: PageMain,
  Hero: PageHero,
  SectionHeader: SectionHeader,
};
