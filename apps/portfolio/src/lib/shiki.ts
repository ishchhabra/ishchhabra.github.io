import { createCssVariablesTheme, createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";

const cssVarsTheme = createCssVariablesTheme({
  name: "css-variables",
  variablePrefix: "--shiki-",
});

const highlighter = createHighlighterCoreSync({
  themes: [cssVarsTheme],
  langs: [tsx, typescript, javascript, json, shellscript],
  engine: createJavaScriptRegexEngine(),
});

const langAliases: Record<string, string> = {
  bash: "shellscript",
  sh: "shellscript",
  ts: "typescript",
  js: "javascript",
};

function resolveLang(lang?: string): string {
  const resolved = lang ? (langAliases[lang] ?? lang) : "tsx";
  return highlighter.getLoadedLanguages().includes(resolved) ? resolved : "plaintext";
}

function tokensToHtml(tokens: { content: string; color?: string }[]): string {
  return tokens
    .map((t) => {
      const escaped = t.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return t.color ? `<span style="color:${t.color}">${escaped}</span>` : escaped;
    })
    .join("");
}

/**
 * Highlight code and return flat inline HTML (colored spans only, no wrappers).
 * Drop-in replacement for sugar-high's `highlight()`.
 */
export function highlightCode(code: string, lang?: string): string {
  const language = resolveLang(lang);

  const { tokens } = highlighter.codeToTokens(code, {
    lang: language,
    theme: "css-variables",
  });

  return tokens.map((line) => tokensToHtml(line)).join("\n");
}
