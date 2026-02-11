import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

const surfaceVariants = cva("rounded-xl border border-zinc-200 dark:border-white/5", {
  variants: {
    variant: {
      default: "bg-zinc-50 dark:bg-white/2",
      panel: "flex flex-col overflow-hidden bg-white dark:border-white/8 dark:bg-zinc-900/60",
      code: "overflow-hidden bg-zinc-100 dark:bg-[#0d1117]",
      outline: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface SurfaceProps extends VariantProps<typeof surfaceVariants> {
  className?: string;
  children: ReactNode;
}

export function Surface({ variant = "default", className, children }: SurfaceProps) {
  return <div className={surfaceVariants({ variant, className })}>{children}</div>;
}
