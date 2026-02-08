import { tool } from "ai";
import { z } from "zod";

/**
 * AI SDK tool definitions for DOM manipulation.
 *
 * These are "proxy" tools — they run on the server where there is no DOM.
 * The execute function validates the input and echoes it back so the client
 * can apply the mutation to the real DOM via the SSE stream.
 */

// ---------------------------------------------------------------------------
// dom_write — modify existing elements
// ---------------------------------------------------------------------------

export const domWriteTool = tool({
  description: `Write to the DOM. Applies to all elements matching the selector (excluding overlay).
When the user has selected elements and says "make it X", use selector [data-i2-selected].
For document-wide changes, use an appropriate CSS selector.

Path format:
- style.<property>: CSS property (e.g. style.color, style.backgroundColor)
- text: replace textContent
- html: replace innerHTML
- attr.<name>: set attribute
- attr.-<name>: remove attribute
- class.<name>: add class
- -class.<name>: remove class`,
  inputSchema: z.object({
    selector: z.string().describe("CSS selector targeting element(s) to modify"),
    path: z.string().describe("Property path (e.g. style.color, text, attr.href, class.active)"),
    value: z.string().describe("Value to write"),
  }),
  execute: async (input) => ({ ...input, applied: true }),
});

// ---------------------------------------------------------------------------
// dom_insert — insert new HTML
// ---------------------------------------------------------------------------

export const domInsertTool = tool({
  description: `Insert HTML into the DOM relative to a target element (first match of selector).
Position: before | after | prepend | append.`,
  inputSchema: z.object({
    targetSelector: z.string().describe("CSS selector for the target element"),
    position: z.enum(["before", "after", "prepend", "append"]),
    html: z.string().describe("HTML to insert"),
  }),
  execute: async (input) => ({ ...input, applied: true }),
});

// ---------------------------------------------------------------------------
// dom_read — inspect elements (informational only)
// ---------------------------------------------------------------------------

export const domReadTool = tool({
  description: `Inspect an element. The page structure and element context are already provided in the system prompt. Use this to think about what to do before calling dom_write or dom_insert.`,
  inputSchema: z.object({
    selector: z.string().describe("CSS selector to inspect"),
    path: z
      .string()
      .describe("What to read (e.g. text, html, style, style.color, attr.href, classes)"),
  }),
  execute: async (input) => ({
    ...input,
    note: "Page structure was provided in context. Proceed with dom_write or dom_insert.",
  }),
});
