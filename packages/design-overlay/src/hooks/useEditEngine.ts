import { useCallback, useRef, useState } from "react";
import type {
  EditHistoryEntry,
  EditOperation,
  ElementSnapshot,
  InsertPosition,
  InsertedNodeRef,
} from "@/lib/edit-types";

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

function captureSnapshot(el: Element, elementIndex: number): ElementSnapshot {
  return {
    elementIndex,
    outerHTML: el.outerHTML,
    inlineStyle: (el as HTMLElement).style?.cssText ?? "",
    classes: [...el.classList],
  };
}

/**
 * Restore an element to a previously captured snapshot.
 *
 * Phase 1: fast-path restore of inline styles and classes (handles most edits).
 * Phase 2: full outerHTML restore if content/attributes still differ.
 */
function restoreFromSnapshot(el: Element, snapshot: ElementSnapshot): void {
  const htmlEl = el as HTMLElement;

  // Phase 1 — restore inline styles and classes
  htmlEl.style.cssText = snapshot.inlineStyle;
  el.setAttribute("class", snapshot.classes.join(" "));

  // Phase 2 — if outer structure still differs, do a full attribute + innerHTML restore
  if (el.outerHTML !== snapshot.outerHTML) {
    const template = document.createElement("template");
    template.innerHTML = snapshot.outerHTML;
    const restored = template.content.firstElementChild;
    if (restored) {
      while (el.attributes.length > 0) {
        el.removeAttribute(el.attributes[0]!.name);
      }
      for (const attr of restored.attributes) {
        el.setAttribute(attr.name, attr.value);
      }
      el.innerHTML = restored.innerHTML;
    }
  }
}

// ---------------------------------------------------------------------------
// Element resolution
// ---------------------------------------------------------------------------

/** Query all matching elements, excluding overlay internals. */
function querySelectorFiltered(selector: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(selector)).filter(
      (el) => !el.closest?.("[data-i2-overlay]"),
    );
  } catch {
    return [];
  }
}

/** Resolve target elements for an EditOperation (elementIndex or CSS selector). */
function resolveTargetElements(
  op: Extract<EditOperation, { elementIndex?: number; selector?: string }>,
  selectedElements: Element[],
): Element[] {
  if (op.selector) return querySelectorFiltered(op.selector);
  if (op.elementIndex !== undefined) {
    const el = selectedElements[op.elementIndex];
    return el ? [el] : [];
  }
  return [];
}

/** Resolve the single target element for an insert-html operation. */
function resolveInsertTarget(
  op: Extract<EditOperation, { type: "insert-html" }>,
  selectedElements: Element[],
): Element | null {
  if (op.targetSelector) {
    const el = querySelectorFiltered(op.targetSelector)[0];
    return el ?? null;
  }
  if (op.targetElementIndex !== undefined) {
    return selectedElements[op.targetElementIndex] ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// DOM mutation helpers
// ---------------------------------------------------------------------------

type ElementOp = Extract<
  EditOperation,
  {
    type:
      | "set-style"
      | "add-class"
      | "remove-class"
      | "set-attribute"
      | "remove-attribute"
      | "set-text-content"
      | "set-inner-html";
  }
>;

function applyElementOperation(el: Element, op: ElementOp): void {
  const htmlEl = el as HTMLElement;
  switch (op.type) {
    case "set-style":
      htmlEl.style.setProperty(
        op.property.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
        op.value,
      );
      break;
    case "add-class":
      el.classList.add(op.className);
      break;
    case "remove-class":
      el.classList.remove(op.className);
      break;
    case "set-attribute":
      el.setAttribute(op.name, op.value);
      break;
    case "remove-attribute":
      el.removeAttribute(op.name);
      break;
    case "set-text-content":
      el.textContent = op.text;
      break;
    case "set-inner-html":
      el.innerHTML = op.html;
      break;
    default: {
      const _: never = op;
      console.warn("Unknown operation type:", _);
    }
  }
}

/** Apply a path-based write (style.<prop>, text, html, attr.<name>, class.<name>, -class.<name>). */
function applyPathWrite(el: Element, path: string, value: string): void {
  const htmlEl = el as HTMLElement;
  if (path.startsWith("style.")) {
    const prop = path.slice(6).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    htmlEl.style.setProperty(prop, value, "important");
  } else if (path === "text") {
    el.textContent = value;
  } else if (path === "html") {
    el.innerHTML = value;
  } else if (path.startsWith("attr.")) {
    const name = path.slice(5);
    if (name.startsWith("-")) {
      el.removeAttribute(name.slice(1));
    } else {
      el.setAttribute(name, value);
    }
  } else if (path.startsWith("class.")) {
    el.classList.add(path.slice(6));
  } else if (path.startsWith("-class.")) {
    el.classList.remove(path.slice(7));
  }
}

/** Insert HTML relative to a target element and return refs for undo. */
function insertHTML(target: Element, position: InsertPosition, html: string): InsertedNodeRef[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;
  const refs: InsertedNodeRef[] = [];

  switch (position) {
    case "before":
      while (fragment.firstChild) {
        const node = fragment.firstChild;
        target.parentElement?.insertBefore(node, target);
        refs.push({ node });
      }
      break;
    case "after": {
      const next = target.nextSibling;
      while (fragment.firstChild) {
        const node = fragment.firstChild;
        target.parentElement?.insertBefore(node, next);
        refs.push({ node });
      }
      break;
    }
    case "prepend":
      while (fragment.firstChild) {
        const node = fragment.firstChild;
        target.insertBefore(node, target.firstChild);
        refs.push({ node });
      }
      break;
    case "append":
      while (fragment.firstChild) {
        const node = fragment.firstChild;
        target.appendChild(node);
        refs.push({ node });
      }
      break;
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface EditEngineResult {
  /** Apply typed edit operations to selected elements. */
  applyEdits: (elements: Element[], operations: EditOperation[], description: string) => void;
  /** Apply a path-based write to all elements matching a CSS selector. */
  applyDomWrite: (selector: string, path: string, value: string, description?: string) => void;
  /** Insert HTML relative to the first element matching a CSS selector. */
  applyDomInsert: (
    targetSelector: string,
    position: InsertPosition,
    html: string,
    description?: string,
  ) => void;
  /** Undo the last edit. Returns true if an edit was undone. */
  undo: () => boolean;
  /** Number of undoable edits in history. */
  undoCount: number;
  /** Discard all undo history. */
  clearHistory: () => void;
}

export function useEditEngine(): EditEngineResult {
  const [undoCount, setUndoCount] = useState(0);
  const historyRef = useRef<EditHistoryEntry[]>([]);

  const pushHistory = useCallback((entry: EditHistoryEntry) => {
    historyRef.current.push(entry);
    setUndoCount(historyRef.current.length);
  }, []);

  // -- applyEdits: typed EditOperation[] (programmatic API) -------------------

  const applyEdits = useCallback(
    (elements: Element[], operations: EditOperation[], description: string) => {
      if (operations.length === 0) return;

      const affectedElements: Element[] = [];
      const snapshotMap = new Map<Element, number>();
      const insertedNodes: InsertedNodeRef[] = [];

      const getOrAddIndex = (el: Element): number => {
        let idx = snapshotMap.get(el);
        if (idx === undefined) {
          idx = affectedElements.length;
          affectedElements.push(el);
          snapshotMap.set(el, idx);
        }
        return idx;
      };

      // Collect all affected elements and capture snapshots BEFORE mutation
      for (const op of operations) {
        if (op.type === "insert-html") {
          const target = resolveInsertTarget(op, elements);
          if (target) getOrAddIndex(target);
        } else {
          for (const el of resolveTargetElements(op, elements)) getOrAddIndex(el);
        }
      }

      const snapshots = affectedElements.map((el, i) => captureSnapshot(el, i));

      // Apply all operations
      for (const op of operations) {
        if (op.type === "insert-html") {
          const target = resolveInsertTarget(op, elements);
          if (target) insertedNodes.push(...insertHTML(target, op.position, op.html));
        } else {
          for (const el of resolveTargetElements(op, elements)) {
            applyElementOperation(el, op);
          }
        }
      }

      const entry: EditHistoryEntry = { description, snapshots, elements: affectedElements };
      if (insertedNodes.length > 0) entry.insertedNodes = insertedNodes;
      pushHistory(entry);
    },
    [pushHistory],
  );

  // -- applyDomWrite: path-based write (AI tool interface) --------------------

  const applyDomWrite = useCallback(
    (selector: string, path: string, value: string, description = "dom_write") => {
      let targets = querySelectorFiltered(selector);
      if (targets.length === 0 && /\[data-i2-selected\]/.test(selector)) {
        targets = querySelectorFiltered("body");
      }
      if (targets.length === 0) return;

      const snapshots = targets.map((el, i) => captureSnapshot(el, i));
      for (const el of targets) applyPathWrite(el, path, value);
      pushHistory({ description, snapshots, elements: targets });
    },
    [pushHistory],
  );

  // -- applyDomInsert: HTML insertion (AI tool interface) ---------------------

  const applyDomInsert = useCallback(
    (
      targetSelector: string,
      position: InsertPosition,
      html: string,
      description = "dom_insert",
    ) => {
      const target = querySelectorFiltered(targetSelector)[0];
      if (!target) return;

      const snapshots = [captureSnapshot(target, 0)];
      const insertedNodes = insertHTML(target, position, html);
      pushHistory({ description, snapshots, elements: [target], insertedNodes });
    },
    [pushHistory],
  );

  // -- Undo -------------------------------------------------------------------

  const undo = useCallback((): boolean => {
    const entry = historyRef.current.pop();
    if (!entry) return false;

    // Restore element snapshots
    for (const snapshot of entry.snapshots) {
      const el = entry.elements[snapshot.elementIndex];
      if (el) restoreFromSnapshot(el, snapshot);
    }

    // Remove any inserted nodes
    if (entry.insertedNodes) {
      for (const { node } of entry.insertedNodes) {
        try {
          node.remove();
        } catch {
          // Node may already be detached
        }
      }
    }

    setUndoCount(historyRef.current.length);
    return true;
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setUndoCount(0);
  }, []);

  return { applyEdits, applyDomWrite, applyDomInsert, undo, undoCount, clearHistory };
}
