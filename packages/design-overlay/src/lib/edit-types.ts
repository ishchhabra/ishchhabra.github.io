/**
 * Types for the AI-powered DOM editing system.
 *
 * The edit flow:
 *   1. Serialize selected elements + page context → ElementContext[], PageContext
 *   2. Send to AI with user prompt
 *   3. AI returns tool calls (dom_write / dom_insert)
 *   4. Client resolves CSS selectors and applies mutations to the live DOM
 *   5. Snapshot before/after for undo
 *
 * Targeting modes:
 * - elementIndex: reference selected elements (0-based)
 * - selector: CSS selector for document-wide changes (e.g. "button", ".btn")
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type InsertPosition = "before" | "after" | "prepend" | "append";

// ---------------------------------------------------------------------------
// Page context (for document-wide edits without selection)
// ---------------------------------------------------------------------------

/** Lightweight page structure for AI to understand document layout. */
export interface PageContext {
  /** Tag name counts (e.g. { button: 3, a: 5 }) */
  tagCounts: Record<string, number>;
  /** Semantically important elements: id, tag, and sample classes. */
  landmarks: Array<{ id?: string; tag: string; classes: string[]; text?: string }>;
  /** Outline of main structure (tag hierarchy). */
  structure: string;
  /** Page title (document.title or first h1). */
  pageTitle?: string;
  /** Detected theme for matching new content. */
  theme?: "dark" | "light";
  /** Key content: h1 + first paragraph (what the page is about). */
  contentSummary?: string;
  /** Sample HTML from first section (for style matching when adding sections). */
  sampleSectionHTML?: string;
}

const MAX_SAMPLE_HTML = 1800;
const MAX_STRUCTURE_DEPTH = 4;
const MAX_STRUCTURE_LINES = 50;

/** Detect theme based on computed background luminance and common dark-mode class conventions. */
function detectTheme(doc: Document | null): "dark" | "light" {
  if (!doc) return "light";

  // Common convention: "dark" class on <html>
  if (doc.documentElement.classList.contains("dark")) return "dark";

  // Fall back to computed background luminance of <body>
  try {
    const bg = getComputedStyle(doc.body).backgroundColor;
    const channels = bg.match(/\d+/g);
    if (channels && channels.length >= 3) {
      const luminance =
        0.299 * Number(channels[0]) +
        0.587 * Number(channels[1]) +
        0.114 * Number(channels[2]);
      if (luminance < 128) return "dark";
    }
  } catch {
    // getComputedStyle may throw in non-browser contexts
  }

  return "light";
}

/** Serialize page structure for AI context. Excludes overlay elements. */
export function serializePageContext(root: Document | Element = document): PageContext {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const el = root instanceof Document ? root.body : root;
  const tagCounts: Record<string, number> = {};
  const landmarks: PageContext["landmarks"] = [];
  const lines: string[] = [];

  const LANDMARK_TAGS = new Set(["header", "main", "nav", "footer", "section", "article"]);
  const SKIP_TAGS = new Set(["script", "style", "svg"]);

  function walk(node: Element, depth: number) {
    if (node.closest?.("[data-i2-overlay]")) return;
    const tag = node.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;

    // Record landmarks (semantic elements or elements with id)
    if (node.id || LANDMARK_TAGS.has(tag)) {
      const text = node.textContent?.trim().slice(0, 40);
      const landmark: PageContext["landmarks"][0] = {
        tag,
        classes: [...node.classList].slice(0, 3),
      };
      if (node.id) landmark.id = node.id;
      if (text) landmark.text = text;
      landmarks.push(landmark);
    }

    // Build hierarchical structure outline
    if (depth < MAX_STRUCTURE_DEPTH && lines.length < MAX_STRUCTURE_LINES) {
      const visibleChildren = [...node.children].filter(
        (c) => c instanceof Element && !c.closest?.("[data-i2-overlay]"),
      );
      if (visibleChildren.length > 0) {
        lines.push(`${"  ".repeat(depth)}<${tag}>`);
        for (const child of visibleChildren) {
          if (child instanceof Element) walk(child, depth + 1);
        }
      }
    }
  }

  walk(el, 0);

  const structure = lines.length > 0
    ? lines.join("\n")
    : `<${el.tagName.toLowerCase()}>`;

  const pageTitle =
    doc?.title || el.querySelector("h1")?.textContent?.trim().slice(0, 80) || "";

  const h1 = el.querySelector("h1");
  const firstP = el.querySelector("main p, article p, .content p, p");
  const contentSummary = [h1?.textContent?.trim(), firstP?.textContent?.trim()]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 200);

  const firstSection = el.querySelector("main section, main > div, article section, section");
  const sampleSectionHTML = firstSection
    ? firstSection.outerHTML.slice(0, MAX_SAMPLE_HTML)
    : undefined;

  const out: PageContext = {
    tagCounts,
    landmarks,
    structure,
    theme: detectTheme(doc),
  };
  if (pageTitle) out.pageTitle = pageTitle;
  if (contentSummary) out.contentSummary = contentSummary;
  if (sampleSectionHTML) out.sampleSectionHTML = sampleSectionHTML;
  return out;
}

// ---------------------------------------------------------------------------
// Element serialization (sent to the AI so it knows what it's editing)
// ---------------------------------------------------------------------------

/** Serializable representation of a DOM element for the AI. */
export interface ElementContext {
  /** Index into the selectedElements array — used to reference this element in operations. */
  index: number;
  /** Element id if present. */
  id?: string;
  /** HTML tag name (lowercase). */
  tagName: string;
  /** The element's outerHTML (truncated for very large subtrees). */
  outerHTML: string;
  /** Current CSS class list. */
  classes: string[];
  /** Inline style attribute value. */
  inlineStyle: string;
  /** A subset of computed styles most relevant to layout and appearance. */
  computedStyles: Record<string, string>;
  /** Direct text content (not recursive). */
  textContent: string;
  /** Bounding rect in viewport coordinates. */
  rect: { x: number; y: number; width: number; height: number };
}

/** Computed style properties we send to the AI. */
const RELEVANT_STYLE_PROPERTIES = [
  "display",
  "position",
  "width",
  "height",
  "padding",
  "margin",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "color",
  "backgroundColor",
  "borderRadius",
  "border",
  "boxShadow",
  "opacity",
  "overflow",
  "textAlign",
  "flexDirection",
  "alignItems",
  "justifyContent",
  "gap",
] as const;

/** Maximum outerHTML length before we truncate. */
const MAX_OUTER_HTML_LENGTH = 2000;

/** Serialize a DOM element into a portable context object. */
export function serializeElement(el: Element, index: number): ElementContext {
  const computed = getComputedStyle(el);
  const computedStyles: Record<string, string> = {};
  for (const prop of RELEVANT_STYLE_PROPERTIES) {
    computedStyles[prop] = computed.getPropertyValue(
      prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
    );
  }

  let outerHTML = el.outerHTML;
  if (outerHTML.length > MAX_OUTER_HTML_LENGTH) {
    outerHTML = outerHTML.slice(0, MAX_OUTER_HTML_LENGTH) + "<!-- truncated -->";
  }

  const rect = el.getBoundingClientRect();

  return {
    index,
    ...(el.id && { id: el.id }),
    tagName: el.tagName.toLowerCase(),
    outerHTML,
    classes: [...el.classList],
    inlineStyle: (el as HTMLElement).style?.cssText ?? "",
    computedStyles,
    textContent: el.textContent?.slice(0, 500) ?? "",
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

/** Serialize an array of selected elements. */
export function serializeElements(elements: Element[]): ElementContext[] {
  return elements.map((el, i) => serializeElement(el, i));
}

// ---------------------------------------------------------------------------
// Edit operations (returned by the AI, applied to the DOM)
// ---------------------------------------------------------------------------

export interface SetStyleOperation {
  type: "set-style";
  elementIndex?: number;
  selector?: string;
  /** CSS property in camelCase (e.g. "backgroundColor"). */
  property: string;
  /** CSS value to set (e.g. "red", "16px"). */
  value: string;
}

export interface AddClassOperation {
  type: "add-class";
  elementIndex?: number;
  selector?: string;
  className: string;
}

export interface RemoveClassOperation {
  type: "remove-class";
  elementIndex?: number;
  selector?: string;
  className: string;
}

export interface SetAttributeOperation {
  type: "set-attribute";
  elementIndex?: number;
  selector?: string;
  name: string;
  value: string;
}

export interface RemoveAttributeOperation {
  type: "remove-attribute";
  elementIndex?: number;
  selector?: string;
  name: string;
}

export interface SetTextContentOperation {
  type: "set-text-content";
  elementIndex?: number;
  selector?: string;
  text: string;
}

export interface SetInnerHTMLOperation {
  type: "set-inner-html";
  elementIndex?: number;
  selector?: string;
  html: string;
}

/** Insert HTML at a position relative to a target element. */
export interface InsertHTMLOperation {
  type: "insert-html";
  position: InsertPosition;
  targetElementIndex?: number;
  targetSelector?: string;
  html: string;
}

export type EditOperation =
  | SetStyleOperation
  | AddClassOperation
  | RemoveClassOperation
  | SetAttributeOperation
  | RemoveAttributeOperation
  | SetTextContentOperation
  | SetInnerHTMLOperation
  | InsertHTMLOperation;

// ---------------------------------------------------------------------------
// Undo snapshots
// ---------------------------------------------------------------------------

/** Captured state of one element before an edit was applied. */
export interface ElementSnapshot {
  elementIndex: number;
  outerHTML: string;
  inlineStyle: string;
  classes: string[];
}

/** Inserted node to remove on undo. */
export interface InsertedNodeRef {
  node: ChildNode;
}

/** A single undo-able edit action. */
export interface EditHistoryEntry {
  description: string;
  snapshots: ElementSnapshot[];
  elements: Element[];
  insertedNodes?: InsertedNodeRef[];
}
