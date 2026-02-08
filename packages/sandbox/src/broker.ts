import type {
  CapabilityRequest,
  CapabilityType,
  ClipboardDetails,
  CookieDetails,
  FetchDetails,
  PendingRequest,
  PermissionDecision,
  PermissionRule,
  PermissionState,
  StorageDetails,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a human-readable summary for a capability request. */
export function summarizeRequest(req: CapabilityRequest): string {
  switch (req.capability) {
    case "fetch": {
      const d = req.details as FetchDetails;
      const method = (d.method ?? "GET").toUpperCase();
      return `${method} ${d.url}`;
    }
    case "storage": {
      const d = req.details as StorageDetails;
      if (d.operation === "clear") return "Clear all storage";
      return `${d.operation} storage key "${d.key ?? ""}"`;
    }
    case "clipboard": {
      const d = req.details as ClipboardDetails;
      return d.operation === "read" ? "Read clipboard" : "Write to clipboard";
    }
    case "cookie": {
      const d = req.details as CookieDetails;
      return d.operation === "read" ? "Read cookies" : "Write cookie";
    }
    default:
      return `Unknown capability: ${req.capability}`;
  }
}

/** Extract a matchable pattern from the request details. */
function extractPattern(req: CapabilityRequest): string {
  switch (req.capability) {
    case "fetch": {
      const d = req.details as FetchDetails;
      try {
        const url = new URL(d.url);
        return url.origin + url.pathname;
      } catch {
        return d.url;
      }
    }
    case "storage": {
      const d = req.details as StorageDetails;
      return d.key ?? "*";
    }
    case "clipboard": {
      const d = req.details as ClipboardDetails;
      return d.operation;
    }
    case "cookie": {
      const d = req.details as CookieDetails;
      if (d.operation === "read") return "read";
      // Extract cookie name from "name=value; path=/; ..."
      const name = (d.value ?? "").split(";")[0]?.split("=")[0]?.trim() || "*";
      return name;
    }
    default:
      return "*";
  }
}

/** Check if a pattern matches a rule's pattern. Simple prefix/exact match. */
function patternMatches(rulePattern: string, requestPattern: string): boolean {
  if (rulePattern === "*") return true;
  if (rulePattern.endsWith("/*")) {
    const prefix = rulePattern.slice(0, -1);
    return requestPattern.startsWith(prefix);
  }
  return rulePattern === requestPattern;
}

/* ------------------------------------------------------------------ */
/*  Broker                                                             */
/* ------------------------------------------------------------------ */

export interface BrokerCallbacks {
  /** Called when a new request needs user approval. */
  onPrompt: (pending: PendingRequest) => void;
  /** Called when a prompt is resolved (so UI can dismiss). */
  onPromptResolved: (id: string) => void;
}

export class CapabilityBroker {
  private state: PermissionState;
  private enabledCapabilities: Set<CapabilityType>;
  private callbacks: BrokerCallbacks;

  constructor(
    enabledCapabilities: CapabilityType[],
    initialRules: PermissionRule[],
    callbacks: BrokerCallbacks,
  ) {
    this.enabledCapabilities = new Set(enabledCapabilities);
    this.state = { rules: [...initialRules] };
    this.callbacks = callbacks;
  }

  /** Handle a capability request from the sandbox. Returns the result or error. */
  async handleRequest(req: CapabilityRequest): Promise<{ result?: unknown; error?: string }> {
    // 1. Check if the capability is enabled at all
    if (!this.enabledCapabilities.has(req.capability)) {
      return {
        error: `Capability "${req.capability}" is not enabled for this sandbox.`,
      };
    }

    // 2. Check persisted rules
    const pattern = extractPattern(req);
    const existingRule = this.state.rules.find(
      (r) => r.capability === req.capability && patternMatches(r.pattern, pattern),
    );

    if (existingRule) {
      if (existingRule.decision === "deny") {
        return {
          error: `Denied by permission rule: ${req.capability} → ${existingRule.pattern}`,
        };
      }
      // allow — execute directly
      return this.execute(req);
    }

    // 3. No rule matches — ask the user
    const decision = await this.promptUser(req, pattern);
    return this.applyDecision(decision, req, pattern);
  }

  /** Prompt the user and wait for their decision. */
  private promptUser(req: CapabilityRequest, _pattern: string): Promise<PermissionDecision> {
    return new Promise<PermissionDecision>((resolve) => {
      const pending: PendingRequest = {
        id: req.id,
        capability: req.capability,
        details: req.details,
        summary: summarizeRequest(req),
        resolve: (decision: PermissionDecision) => {
          this.callbacks.onPromptResolved(req.id);
          resolve(decision);
        },
      };
      this.callbacks.onPrompt(pending);
    });
  }

  /** Apply user's decision: persist if always, then execute or deny. */
  private async applyDecision(
    decision: PermissionDecision,
    req: CapabilityRequest,
    pattern: string,
  ): Promise<{ result?: unknown; error?: string }> {
    switch (decision) {
      case "allow-once":
        return this.execute(req);

      case "allow-always":
        this.state.rules.push({
          capability: req.capability,
          pattern,
          decision: "allow",
        });
        return this.execute(req);

      case "deny-once":
        return { error: "Permission denied by user." };

      case "deny-always":
        this.state.rules.push({
          capability: req.capability,
          pattern,
          decision: "deny",
        });
        return { error: "Permission denied by user." };
    }
  }

  /** Execute the capability on behalf of the sandbox. */
  private async execute(req: CapabilityRequest): Promise<{ result?: unknown; error?: string }> {
    try {
      switch (req.capability) {
        case "fetch":
          return {
            result: await this.executeFetch(req.details as FetchDetails),
          };
        case "storage":
          return { result: this.executeStorage(req.details as StorageDetails) };
        case "clipboard":
          return {
            result: await this.executeClipboard(req.details as ClipboardDetails),
          };
        case "cookie":
          return { result: this.executeCookie(req.details as CookieDetails) };
        default:
          return { error: `Unknown capability: ${req.capability}` };
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async executeFetch(details: FetchDetails) {
    const init: RequestInit = {
      method: details.method ?? "GET",
    };
    if (details.headers) init.headers = details.headers;
    if (details.body) init.body = details.body;
    const res = await fetch(details.url, init);
    const text = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: text,
    };
  }

  private executeStorage(details: StorageDetails) {
    // Uses the HOST's localStorage on behalf of the sandbox.
    // In production you'd namespace this per sandbox instance.
    const prefix = "__sandbox__:";
    switch (details.operation) {
      case "get":
        return { value: localStorage.getItem(prefix + (details.key ?? "")) };
      case "set":
        localStorage.setItem(prefix + (details.key ?? ""), details.value ?? "");
        return { success: true };
      case "remove":
        localStorage.removeItem(prefix + (details.key ?? ""));
        return { success: true };
      case "clear":
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith(prefix)) localStorage.removeItem(key);
        }
        return { success: true };
    }
  }

  private async executeClipboard(details: ClipboardDetails) {
    if (details.operation === "write") {
      await navigator.clipboard.writeText(details.text ?? "");
      return { success: true };
    }
    const text = await navigator.clipboard.readText();
    return { text };
  }

  /** Sandbox cookie store (host-side, namespaced); mirrors document.cookie semantics. */
  private static cookieStore = new Map<string, string>();

  private executeCookie(details: CookieDetails) {
    const store = CapabilityBroker.cookieStore;
    if (details.operation === "read") {
      const value = [...store.values()].join("; ");
      return { value };
    }
    // Write: "name=value; path=/; max-age=3600" → store by name
    const assign = (details.value ?? "").trim();
    if (!assign) return { success: true };
    const name = assign.split(";")[0]?.split("=")[0]?.trim();
    if (name) store.set(name, assign);
    return { success: true };
  }

  /** Get current rules (for debugging / display). */
  getRules(): PermissionRule[] {
    return [...this.state.rules];
  }
}
