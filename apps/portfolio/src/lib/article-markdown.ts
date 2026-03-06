import TurndownService from "turndown";
// @ts-expect-error - no types for turndown-plugin-gfm
import { gfm } from "turndown-plugin-gfm";
import { renderArticleToHtml } from "./article-renderer";
import { SITE_BASE_URL } from "./seo";

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // GFM plugin adds table, strikethrough, and task list support
  td.use(gfm);

  // Fenced code blocks with language from class="language-{lang}" on <code>
  td.addRule("fencedCodeWithLang", {
    filter(node) {
      return node.nodeName === "PRE" && node.firstChild?.nodeName === "CODE";
    },
    replacement(_content, node) {
      const code = (node as HTMLElement).querySelector("code");
      if (!code) return _content;

      const text = code.textContent ?? "";
      const langMatch = code.className?.match(/language-(\S+)/);
      const lang = langMatch?.[1] ?? "";

      return `\n\n\`\`\`${lang}\n${text.replace(/\n$/, "")}\n\`\`\`\n\n`;
    },
  });

  td.keep(["video"]);

  return td;
}

export function renderArticleToMarkdown(slug: string): string {
  const html = renderArticleToHtml(slug);
  const td = createTurndown();
  const body = td.turndown(html);

  const footer = [
    "---",
    "",
    `*Originally published on [ishchhabra.com](${SITE_BASE_URL}/writing/${slug}). Follow me there for more.*`,
  ].join("\n");

  return `${body}\n\n${footer}`;
}
