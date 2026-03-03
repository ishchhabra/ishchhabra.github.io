import { createHighlighterCoreSync, createCssVariablesTheme } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import shellscript from "shiki/langs/shellscript.mjs";

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

export function highlightCode(code: string, lang?: string): string {
  const resolved = lang ? (langAliases[lang] ?? lang) : "tsx";
  const loadedLangs = highlighter.getLoadedLanguages();

  const language = loadedLangs.includes(resolved) ? resolved : "plaintext";

  const html = highlighter.codeToHtml(code, {
    lang: language,
    theme: "css-variables",
  });

  // Strip outer <pre><code>...</code></pre> wrapper since HighlightedCode provides its own
  return html.replace(/^<pre[^>]*><code[^>]*>/, "").replace(/<\/code><\/pre>$/, "");
}
