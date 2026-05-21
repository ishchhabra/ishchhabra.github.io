export {
  AnalysisManager,
  PreservedAnalyses,
  type AnalysisKey,
  type FunctionAnalysis,
  type FunctionAnalysisKey,
  type ModuleAnalysis,
  type ModuleAnalysisKey,
} from "./AnalysisManager";

export { DominatorTree, DominatorTreeAnalysis } from "./DominatorTree";

export { BindingEscapeAnalysis } from "./BindingEscapeAnalysis";
export type { BindingEscapeInfo } from "./BindingEscapeAnalysis";
export { BindingPromotionAnalysis } from "./BindingPromotionAnalysis";
export type { BindingPromotionInfo } from "./BindingPromotionAnalysis";
