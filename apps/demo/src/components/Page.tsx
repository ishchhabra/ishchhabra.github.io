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

export const Page = {
  Main: PageMain,
};
