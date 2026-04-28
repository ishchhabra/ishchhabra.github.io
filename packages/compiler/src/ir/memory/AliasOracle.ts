import type { Environment } from "../../environment";
import type { Operation } from "../core/Operation";
import { UnknownLocation, type MemoryLocation } from "./MemoryLocation";

export type AliasResult = "no-alias" | "may-alias" | "must-alias";
export type ModRefInfo = "no-mod-ref" | "ref" | "mod" | "mod-ref";

export class AliasOracle {
  constructor(private readonly environment?: Environment) {}

  alias(left: MemoryLocation, right: MemoryLocation): AliasResult {
    if (isUnknown(left) || isUnknown(right)) return "may-alias";

    if (left.kind === "local" && right.kind === "local") {
      return left.declarationId === right.declarationId ? "must-alias" : "no-alias";
    }

    if (left.kind === "context" && right.kind === "context") {
      return left.declarationId === right.declarationId ? "must-alias" : "no-alias";
    }

    if (left.kind === "exported" && right.kind === "exported") {
      return left.modulePath === right.modulePath && left.name === right.name
        ? "must-alias"
        : "no-alias";
    }

    if (isHeapLocation(left) || isHeapLocation(right)) {
      return "may-alias";
    }

    return "no-alias";
  }

  mayAlias(left: MemoryLocation, right: MemoryLocation): boolean {
    return this.alias(left, right) !== "no-alias";
  }

  mustAlias(left: MemoryLocation, right: MemoryLocation): boolean {
    return this.alias(left, right) === "must-alias";
  }

  getModRefInfo(op: Operation, location: MemoryLocation): ModRefInfo {
    const effects = op.getMemoryEffects(this.environment);
    const mayRead = effects.reads.some((read) => this.mayAlias(read, location));
    const mayWrite = effects.writes.some((write) => this.mayAlias(write, location));

    if (mayRead && mayWrite) return "mod-ref";
    if (mayWrite) return "mod";
    if (mayRead) return "ref";
    return "no-mod-ref";
  }

  mayRead(op: Operation, location: MemoryLocation): boolean {
    const info = this.getModRefInfo(op, location);
    return info === "ref" || info === "mod-ref";
  }

  mayWrite(op: Operation, location: MemoryLocation): boolean {
    const info = this.getModRefInfo(op, location);
    return info === "mod" || info === "mod-ref";
  }

  mayAccess(op: Operation, location: MemoryLocation): boolean {
    return this.getModRefInfo(op, location) !== "no-mod-ref";
  }

  isControlBarrier(op: Operation): boolean {
    return op.mayThrow(this.environment) || op.mayDiverge(this.environment) || op.isObservable();
  }
}

function isUnknown(location: MemoryLocation): boolean {
  return location === UnknownLocation || location.kind === "unknown";
}

function isHeapLocation(location: MemoryLocation): boolean {
  return location.kind === "staticProperty" || location.kind === "computedProperty";
}
