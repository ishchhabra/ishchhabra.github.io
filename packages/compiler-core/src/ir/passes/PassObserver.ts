import type { FunctionIR } from "../core/FunctionIR";
import type { ModuleIR } from "../core/ModuleIR";

export type PassTargetKind = "function" | "module";

export interface PassStartEvent {
  readonly passName: string;
  readonly target: PassTargetKind;
  readonly moduleIR?: ModuleIR;
  readonly functionIR?: FunctionIR;
}

export interface PassEndEvent extends PassStartEvent {
  readonly changed: boolean;
}

export interface PassObserver {
  onPassStart?(event: PassStartEvent): void;
  onPassEnd?(event: PassEndEvent): void;
}
