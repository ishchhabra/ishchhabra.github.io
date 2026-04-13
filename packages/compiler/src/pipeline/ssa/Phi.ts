/**
 * Re-exports `PhiOp` (the SSA phi op that extends {@link Operation})
 * under the legacy `Phi` name so straggler imports keep compiling.
 *
 * New code should import {@link PhiOp} directly from `ir/ops/mem/Phi`.
 * The `Phi` alias will be removed in a follow-up pass.
 */
export { PhiOp, PhiOp as Phi, makePhiIdentifierName } from "../../ir/ops/mem/Phi";
