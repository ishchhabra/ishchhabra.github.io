import type { FunctionIR } from "../ir/core/FunctionIR";
import type { ModuleIR } from "../ir/core/ModuleIR";
import type {
  PassEndEvent,
  PassObserver,
  PassStartEvent,
  PassTargetKind,
} from "../ir/passes/PassObserver";

export type CompilerStage = "hir" | "ssa" | "optimized" | "ssa-eliminated" | "late-optimized";

export interface CompilerStageEvent {
  readonly stage: CompilerStage;
  readonly moduleIR: ModuleIR;
}

export interface CompilerOutputEvent {
  readonly code: string;
}

export interface CompilerObserver extends PassObserver {
  onStage?(event: CompilerStageEvent): void;
  onOutput?(event: CompilerOutputEvent): void;
}

export type { FunctionIR, ModuleIR, PassEndEvent, PassStartEvent, PassTargetKind };
