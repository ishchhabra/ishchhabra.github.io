import TurndownService from "turndown";
import { renderArticleToHtml } from "./article-renderer";

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

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
  return td.turndown(html);
}
