/* ------------------------------------------------------------------ */
/*  Capabilities                                                       */
/* ------------------------------------------------------------------ */

/** Built-in capability types the sandbox can request. */
export type CapabilityType = "fetch" | "storage" | "clipboard" | "cookie";

/** A capability request coming from the sandbox via postMessage. */
export interface CapabilityRequest {
  /** Unique ID for this request (for pairing response). */
  id: string;
  /** Which capability is being requested. */
  capability: CapabilityType;
  /** Capability-specific details. */
  details: FetchDetails | StorageDetails | ClipboardDetails | CookieDetails;
}

export interface FetchDetails {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface StorageDetails {
  operation: "get" | "set" | "remove" | "clear";
  key?: string;
  value?: string;
}

export interface ClipboardDetails {
  operation: "read" | "write";
  text?: string;
}

export interface CookieDetails {
  operation: "read" | "write";
  value?: string;
}

/* ------------------------------------------------------------------ */
/*  Permissions                                                        */
/* ------------------------------------------------------------------ */

/** What the user decided for a capability request. */
export type PermissionDecision = "allow-once" | "allow-always" | "deny-once" | "deny-always";

/** A persisted permission rule. Created when user picks allow-always or deny-always. */
export interface PermissionRule {
  capability: CapabilityType;
  /** Pattern to match against (e.g. URL pattern for fetch, key for storage). */
  pattern: string;
  decision: "allow" | "deny";
}

/** The full permission state managed by the broker. */
export interface PermissionState {
  /** Persisted rules from allow-always / deny-always decisions. */
  rules: PermissionRule[];
}

/* ------------------------------------------------------------------ */
/*  Broker ↔ Sandbox component interface                               */
/* ------------------------------------------------------------------ */

/** A pending capability request waiting for user decision. */
export interface PendingRequest {
  id: string;
  capability: CapabilityType;
  details: CapabilityRequest["details"];
  /** Human-readable summary of what's being requested. */
  summary: string;
  /** Resolve the promise with the user's decision. */
  resolve: (decision: PermissionDecision) => void;
}

/** Props the Sandbox component accepts for capability control. */
export interface CapabilityConfig {
  /** Which capabilities are available. Omitted capabilities are always denied. */
  capabilities?: CapabilityType[];
  /** Pre-configured permission rules (e.g. always allow fetches to a certain domain). */
  permissions?: PermissionRule[];
}
