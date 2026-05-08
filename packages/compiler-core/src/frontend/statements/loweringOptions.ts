/**
 * Context supplied by parent statement lowering.
 */
export interface StatementLoweringOptions {
  /**
   * Label attached to the statement being lowered.
   *
   * Loop lowers use this to resolve `break label` and `continue label`.
   */
  readonly label?: string | null;
}
