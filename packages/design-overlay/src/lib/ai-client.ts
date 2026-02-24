import type { ElementContext, PageContext } from "./edit-types";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(
  elements: ElementContext[],
  pageContext?: PageContext | null,
): string {
  const parts: string[] = [];

  parts.push(`You are a UI design assistant that edits web pages through DOM tools.

## Tools
- **dom_write(selector, path, value)** — Modify existing elements. Path format: style.<property> | text | html | attr.<name> | class.<name> | -class.<name>
- **dom_insert(targetSelector, position, html)** — Insert new HTML. Position: before | after | prepend | append

## Rules
1. When elements are **selected**, target them with selector \`[data-i2-selected]\`. Never use broad selectors like \`*\` or \`body\` for selection-only edits.
2. For **page-wide** changes, use specific tag or class selectors.
3. When inserting content, **match the page's existing style, theme, and spacing**.
4. Prefer multiple targeted dom_write calls over a single set-inner-html when editing styles or text.`);

  if (elements.length > 0) {
    const descriptions = elements.map((el) => {
      const sel = el.id ? `#${el.id}` : el.classes.length ? `.${el.classes[0]}` : el.tagName;
      return `[${el.index}] <${el.tagName}> ${sel} — "${el.textContent.slice(0, 80)}"`;
    });
    parts.push(
      `\n## Selected Elements\nTarget with \`[data-i2-selected]\`:\n${descriptions.join("\n")}`,
    );
  }

  if (pageContext) {
    const meta: string[] = [];
    if (pageContext.pageTitle) meta.push(`Title: ${pageContext.pageTitle}`);
    if (pageContext.theme) meta.push(`Theme: ${pageContext.theme}`);

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
      parts.push(
        `\n## Sample Section HTML (match this style when adding content)\n\`\`\`html\n${pageContext.sampleSectionHTML}\n\`\`\``,
      );
    }
  } else if (elements.length === 0) {
    parts.push("\nNo element or page context available. Ask the user to select elements.");
  }

  return parts.join("\n");
}

export type LocalAIConfig = {
  baseUrl: string;
  model: string;
};

export interface LocalMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: any[];
}

export type ToolDefinition = {
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
  execute: (args: any) => Promise<string>;
};

export async function runLocalChat(
  userMessages: LocalMessage[],
  elementContext: ElementContext[],
  pageContext: PageContext | null,
  config: LocalAIConfig,
  tools: Record<string, ToolDefinition>,
) {
  const url = `${config.baseUrl.replace(/\/?$/, "")}/api/chat`;

  // Define Ollama tools array
  const ollamaTools = Object.entries(tools).map(([name, tool]) => ({
    type: "function",
    function: {
      name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  const messages: LocalMessage[] = [
    { role: "system", content: buildSystemPrompt(elementContext, pageContext) },
    ...userMessages,
  ];

  let steps = 0;
  const maxSteps = 5;

  while (steps < maxSteps) {
    steps++;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        tools: ollamaTools,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const assistantMessage = data.message;
    messages.push(assistantMessage);

    // If no tool calls, we are done
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      break;
    }

    // Process tool calls
    for (const toolCall of assistantMessage.tool_calls) {
      const { name, arguments: args } = toolCall.function;
      const tool = tools[name];
      if (tool) {
        try {
          const result = await tool.execute(args);
          messages.push({
            role: "tool",
            content: result,
          });
        } catch (err: any) {
          messages.push({
            role: "tool",
            content: `Error: ${err.message}`,
          });
        }
      } else {
        messages.push({
          role: "tool",
          content: `Error: Tool ${name} not found`,
        });
      }
    }
  }

  return messages;
}
