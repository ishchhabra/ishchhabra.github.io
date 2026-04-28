import type { CompilerOptions } from "../compile";
import { CommonJSExportCollectorPass } from "../frontend/passes/CommonJSExportCollectorPass";
import type { ProjectUnit } from "../frontend/ProjectBuilder";
import { CaptureBlockParamFlowSnapshotPass } from "./analysis/BlockParamFlowSnapshot";
import { LateCopyPropagationPass } from "./late-optimizer/passes/LateCopyPropagationPass";
import { LateDeadCodeEliminationPass } from "./late-optimizer/passes/LateDeadCodeEliminationPass";
import { ScalarReplacementOfAggregatesPass } from "./late-optimizer/passes/ScalarReplacementOfAggregatesPass";
import type { PipelineStage } from "./Observer";
import { funcPass, type FunctionPass } from "./PassManager";
import { AlgebraicSimplificationPass } from "./passes/AlgebraicSimplificationPass";
import { CapturePruningPass } from "./passes/CapturePruningPass";
import { CFGSimplificationPass } from "./passes/CFGSimplificationPass";
import { ConstantPropagationPass } from "./passes/ConstantPropagationPass";
import { DeadCodeEliminationPass } from "./passes/DeadCodeEliminationPass";
import { ExpressionInliningPass } from "./passes/ExpressionInliningPass";
import { ReassociationPass } from "./passes/ReassociationPass";
import { ValueMaterializationPass } from "./passes/ValueMaterializationPass";
import { AssignmentExpressionReconstitutionPass } from "./reconstitution/passes/AssignmentExpressionReconstitutionPass";
import { ConditionalExpressionReconstitutionPass } from "./reconstitution/passes/ConditionalExpressionReconstitutionPass";
import { ExportDeclarationMergingPass } from "./reconstitution/passes/ExportDeclarationMergingPass";
import { LogicalExpressionReconstitutionPass } from "./reconstitution/passes/LogicalExpressionReconstitutionPass";
import { SSABuilder } from "./ssa/SSABuilder";
import { SSAEliminator } from "./ssa/SSAEliminator";

export interface FunctionPhase {
  readonly name: string;
  readonly stage?: PipelineStage;
  readonly fixpoint?: boolean;
  readonly passes: readonly FunctionPass[];
}

export function buildFunctionPipeline(
  projectUnit: ProjectUnit,
  options: CompilerOptions,
): readonly FunctionPhase[] {
  return [
    {
      name: "commonjs-export-collection",
      passes: [
        funcPass(
          "commonjs-export-collector",
          (funcOp, AM) => new CommonJSExportCollectorPass(funcOp, funcOp.moduleIR, AM),
        ),
      ],
    },
    {
      name: "ssa-construction",
      stage: "ssa-built",
      passes: [
        funcPass("ssa-builder", (funcOp, AM) => new SSABuilder(funcOp, funcOp.moduleIR, AM)),
      ],
    },
    {
      name: "ssa-optimization",
      stage: "optimized",
      passes: options.enableOptimizer ? buildSSAOptimizationPasses(projectUnit, options) : [],
    },
    {
      name: "block-param-flow-snapshot",
      passes: [
        funcPass(
          "capture-block-param-flow-snapshot",
          (funcOp, AM) => new CaptureBlockParamFlowSnapshotPass(funcOp, AM),
        ),
      ],
    },
    {
      name: "out-of-ssa",
      stage: "ssa-eliminated",
      passes: [
        funcPass("ssa-eliminator", (funcOp) => new SSAEliminator(funcOp, funcOp.moduleIR)),
      ],
    },
    {
      name: "post-ssa-cleanup",
      stage: "late-optimized",
      passes: options.enableLateOptimizer ? buildPostSSACleanupPasses(options) : [],
    },
    {
      name: "syntax-reconstitution",
      fixpoint: true,
      passes: buildSyntaxReconstitutionPasses(options),
    },
    {
      name: "post-reconstitution-cleanup",
      passes: options.enableLateOptimizer ? buildPostSSACleanupPasses(options) : [],
    },
    {
      name: "value-materialization",
      stage: "materialized",
      passes: [
        funcPass(
          "value-materialization",
          (funcOp) => new ValueMaterializationPass(funcOp, funcOp.moduleIR),
        ),
      ],
    },
    {
      name: "export-declaration-merging",
      stage: "exports-merged",
      passes: options.enableExportDeclarationMergingPass
        ? [
            funcPass("export-declaration-merging", (funcOp) => {
              return new ExportDeclarationMergingPass(funcOp);
            }),
          ]
        : [],
    },
  ];
}

function buildSSAOptimizationPasses(
  projectUnit: ProjectUnit,
  options: CompilerOptions,
): FunctionPass[] {
  const algebraicSimp = funcPass(
    "algebraic-simplification",
    (funcOp, AM) => new AlgebraicSimplificationPass(funcOp, AM),
  );
  const constantPropagation = funcPass(
    "constant-propagation",
    (funcOp) => new ConstantPropagationPass(funcOp, funcOp.moduleIR, projectUnit, options),
  );
  const cfgSimplification = funcPass(
    "cfg-simplification",
    (funcOp) => new CFGSimplificationPass(funcOp),
  );
  const reassociation = funcPass("reassociation", (funcOp) => new ReassociationPass(funcOp));
  const expressionInlining = funcPass(
    "expression-inlining",
    (funcOp, AM) => new ExpressionInliningPass(funcOp, funcOp.moduleIR.environment, AM),
  );
  const dce = funcPass(
    "dead-code-elimination",
    (funcOp, AM) => new DeadCodeEliminationPass(funcOp, funcOp.moduleIR.environment, AM),
  );
  const sroa = funcPass(
    "scalar-replacement-of-aggregates",
    (funcOp, AM) =>
      new ScalarReplacementOfAggregatesPass(funcOp, funcOp.moduleIR.environment, AM),
  );
  const capturePruning = funcPass(
    "capture-pruning",
    (funcOp) => new CapturePruningPass(funcOp),
  );

  const passes: FunctionPass[] = [];
  if (options.enableAlgebraicSimplificationPass) passes.push(algebraicSimp);
  if (options.enableReassociationPass) passes.push(reassociation);
  if (options.enableConstantPropagationPass) passes.push(constantPropagation);
  if (options.enableCFGSimplificationPass) passes.push(cfgSimplification);
  if (options.enableExpressionInliningPass) passes.push(expressionInlining);
  if (options.enableDeadCodeEliminationPass) passes.push(dce);
  if (options.enableScalarReplacementOfAggregatesPass) passes.push(sroa);
  if (options.enableAlgebraicSimplificationPass) passes.push(algebraicSimp);
  if (options.enableReassociationPass) passes.push(reassociation);
  if (options.enableConstantPropagationPass) passes.push(constantPropagation);
  if (options.enableCFGSimplificationPass) passes.push(cfgSimplification);
  if (options.enableExpressionInliningPass) passes.push(expressionInlining);
  if (options.enableDeadCodeEliminationPass) passes.push(dce);
  if (options.enableAlgebraicSimplificationPass) passes.push(algebraicSimp);
  if (options.enableExpressionInliningPass) passes.push(expressionInlining);
  if (options.enableCapturePruningPass) passes.push(capturePruning);
  if (options.enableDeadCodeEliminationPass) passes.push(dce);
  return passes;
}

function buildPostSSACleanupPasses(options: CompilerOptions): FunctionPass[] {
  const copyProp = funcPass(
    "late-copy-propagation",
    (funcOp) => new LateCopyPropagationPass(funcOp),
  );
  const dce = funcPass(
    "late-dead-code-elimination",
    (funcOp) => new LateDeadCodeEliminationPass(funcOp, funcOp.moduleIR.environment),
  );

  const passes: FunctionPass[] = [];
  if (options.enableLateCopyPropagationPass) passes.push(copyProp);
  if (options.enableLateDeadCodeEliminationPass) passes.push(dce);
  if (options.enableLateCopyPropagationPass) passes.push(copyProp);
  if (options.enableLateDeadCodeEliminationPass) passes.push(dce);
  return passes;
}

function buildSyntaxReconstitutionPasses(options: CompilerOptions): FunctionPass[] {
  const passes: FunctionPass[] = [];
  if (options.enableAssignmentExpressionReconstitutionPass) {
    passes.push(
      funcPass(
        "assignment-expression-reconstitution",
        (funcOp) => new AssignmentExpressionReconstitutionPass(funcOp),
      ),
    );
  }
  if (options.enableLogicalExpressionReconstitutionPass) {
    passes.push(
      funcPass(
        "logical-expression-reconstitution",
        (funcOp) => new LogicalExpressionReconstitutionPass(funcOp),
      ),
    );
  }
  if (options.enableCFGSimplificationPass) {
    passes.push(funcPass("cfg-simplification", (funcOp) => new CFGSimplificationPass(funcOp)));
  }
  if (options.enableConditionalExpressionReconstitutionPass) {
    passes.push(
      funcPass(
        "conditional-expression-reconstitution",
        (funcOp) => new ConditionalExpressionReconstitutionPass(funcOp),
      ),
    );
  }
  if (options.enableCFGSimplificationPass) {
    passes.push(funcPass("cfg-simplification", (funcOp) => new CFGSimplificationPass(funcOp)));
  }
  return passes;
}
