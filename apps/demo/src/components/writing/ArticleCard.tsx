import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const ARTICLE_TITLE_TRANSITION = "article-title";
const ARTICLE_DESC_TRANSITION = "article-description";

function ArticleCardLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

function ArticleCardTitle({
  as: Component = "div",
  className,
  style,
  children,
}: {
  as?: "div" | "h2" | "h3";
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <Component
      className={className}
      style={{ ...style, viewTransitionName: ARTICLE_TITLE_TRANSITION }}
    >
      {children}
    </Component>
  );
}

function ArticleCardDescription({
  as: Component = "div",
  className,
  style,
  children,
}: {
  as?: "div" | "p";
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <Component
      className={className}
      style={{ ...style, viewTransitionName: ARTICLE_DESC_TRANSITION }}
    >
      {children}
    </Component>
  );
}

function ArticleCardMeta({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

function ArticleCardTags({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

export const ArticleCard = {
  Link: ArticleCardLink,
  Title: ArticleCardTitle,
  Description: ArticleCardDescription,
  Meta: ArticleCardMeta,
  Tags: ArticleCardTags,
};
