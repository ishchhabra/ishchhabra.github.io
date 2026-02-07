import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import { domWriteTool, domInsertTool, domReadTool } from "./dom-tools.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getOllamaBaseUrl(fromRequest?: string | null): string {
  const raw = fromRequest ?? process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
  return `${String(raw).replace(/\/?$/, "")}/api`;
}

// ---------------------------------------------------------------------------
// Context types (mirror client-side types, kept minimal for the server)
// ---------------------------------------------------------------------------

interface ElementContext {
  index: number;
  id?: string;
  tagName: string;
  outerHTML: string;
  classes: string[];
  inlineStyle: string;
  computedStyles: Record<string, string>;
  textContent: string;
  rect: { x: number; y: number; width: number; height: number };
}

interface PageContext {
  tagCounts: Record<string, number>;
  landmarks: Array<{ id?: string; tag: string; classes: string[]; text?: string }>;
  structure: string;
  pageTitle?: string;
  theme?: "dark" | "light";
  contentSummary?: string;
  sampleSectionHTML?: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  elements: ElementContext[],
  pageContext?: PageContext | null,
): string {
  const parts: string[] = [];

  // Core instructions
  parts.push(`You are a UI design assistant that edits web pages through DOM tools.

## Tools

- **dom_write(selector, path, value)** — Modify existing elements.
  Path format: style.<property> | text | html | attr.<name> | class.<name> | -class.<name>
- **dom_insert(targetSelector, position, html)** — Insert new HTML.
  Position: before | after | prepend | append
- **dom_read(selector, path)** — Inspect an element (page context is already provided below).

## Rules

1. When elements are **selected** (listed below), target them with selector \`[data-i2-selected]\`. Never use broad selectors like \`*\` or \`body\` for selection-only edits.
2. For **page-wide** changes ("make all buttons white"), use specific tag or class selectors.
3. When inserting content, **match the page's existing style, theme, and spacing**. Create meaningful, production-quality content — no placeholder text.
4. Prefer multiple targeted dom_write calls over a single set-inner-html when editing styles or text.`);

  // Selected elements context
  if (elements.length > 0) {
    const descriptions = elements.map((el) => {
      const sel = el.id ? `#${el.id}` : el.classes.length ? `.${el.classes[0]}` : el.tagName;
      return `[${el.index}] <${el.tagName}> ${sel} — "${el.textContent.slice(0, 80)}"`;
    });
    parts.push(`\n## Selected Elements\nTarget with \`[data-i2-selected]\`:\n${descriptions.join("\n")}`);
  }

  // Page structure context
  if (pageContext) {
    const meta: string[] = [];
    if (pageContext.pageTitle) meta.push(`Title: ${pageContext.pageTitle}`);
    if (pageContext.theme) meta.push(`Theme: ${pageContext.theme}`);
    if (pageContext.contentSummary) meta.push(`About: ${pageContext.contentSummary}`);

    const tagSummary = Object.entries(pageContext.tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([tag, n]) => `${tag}:${n}`)
      .join(", ");

    const landmarkSummary = pageContext.landmarks
      .slice(0, 12)
      .map((l) => {
        let s = `<${l.tag}`;
        if (l.id) s += `#${l.id}`;
        if (l.classes.length) s += `.${l.classes.slice(0, 2).join(".")}`;
        s += ">";
        return s;
      })
      .join(", ");

    parts.push(`\n## Page Structure
${meta.length > 0 ? meta.join("\n") + "\n" : ""}Tags: ${tagSummary}
Landmarks: ${landmarkSummary}
\`\`\`
${pageContext.structure}
\`\`\``);

    if (pageContext.sampleSectionHTML) {
      parts.push(`\n## Sample Section HTML (match this style when adding content)\n\`\`\`html\n${pageContext.sampleSectionHTML}\n\`\`\``);
    }
  } else if (elements.length === 0) {
    parts.push("\nNo element or page context available. Ask the user to select elements or try again.");
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export async function handleChatRequest(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      messages,
      elementContext,
      pageContext,
      model: modelFromRequest,
      ollamaBaseUrl: baseUrlFromRequest,
    }: {
      messages: UIMessage[];
      elementContext?: ElementContext[];
      pageContext?: PageContext | null;
      model?: string | null;
      ollamaBaseUrl?: string | null;
    } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const elements = Array.isArray(elementContext) ? elementContext : [];
    const page = pageContext ?? null;
    const modelId = modelFromRequest ?? process.env["OLLAMA_MODEL"] ?? "llama3.2";
    const baseUrl = getOllamaBaseUrl(baseUrlFromRequest);
    const ollama = createOllama({ baseURL: baseUrl });

    const result = streamText({
      model: ollama(modelId),
      messages: await convertToModelMessages(messages),
      system: buildSystemPrompt(elements, page),
      tools: {
        dom_write: domWriteTool,
        dom_insert: domInsertTool,
        dom_read: domReadTool,
      },
      toolChoice: "required",
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[design-overlay] Chat API error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
