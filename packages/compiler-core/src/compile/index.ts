export { compileProject } from "./compileProject";
export { compileSource } from "./compileSource";
export { formatFunctionIR, formatModuleIR } from "../ir/formatModuleIR";
export { ProgramSession } from "./ProgramSession";

export type {
  CompilerObserver,
  CompilerOutputEvent,
  CompilerStage,
  CompilerStageEvent,
  FunctionIR,
  ModuleIR,
  PassEndEvent,
  PassStartEvent,
  PassTargetKind,
} from "./CompilerObserver";

export type {
  CompileProjectCopyReason,
  CompileProjectFileResult,
  CompileProjectOptions,
  CompileProjectResult,
} from "./compileProject";

export type { CompileSourceOptions, CompileSourceResult } from "./compileSource";

export type {
  CodeEmissionDecision,
  CompileGraphRequest,
  CompileGraphResult,
  EmissionDecision,
  EmissionRequest,
  EmptyEmissionDecision,
  GraphId,
  OpaqueEmissionDecision,
  PassthroughEmissionDecision,
} from "./ProgramSession";

export type {
  CompilerDiagnostic,
  DiagnosticOptions,
  DiagnosticSeverity,
  SourceLocation,
} from "./diagnostics";
