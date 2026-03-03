import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { getArticleBySlug } from "../../../lib/articles";

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
  slug,
}: {
  as?: "div" | "h1" | "h2" | "h3";
  className?: string;
  slug: string;
}) {
  const article = getArticleBySlug(slug);
  if (!article) {
    return null;
  }

  return (
    <Component className={className} style={{ viewTransitionName: `article-title-${slug}` }}>
      {article.title}
    </Component>
  );
}

function ArticleCardDescription({
  as: Component = "div",
  className,
  slug,
}: {
  as?: "div" | "p";
  className?: string;
  slug: string;
}) {
  const article = getArticleBySlug(slug);
  if (!article) {
    return null;
  }

  return (
    <Component className={className} style={{ viewTransitionName: `article-description-${slug}` }}>
      {article.description}
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
