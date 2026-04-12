import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, DeclarationInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Named class declaration at statement level (`class C extends B { ... }`).
 * Anonymous classes and `let`/context class bindings stay as
 * {@link ClassExpressionInstruction} + {@link StoreLocalInstruction}.
 */
export class ClassDeclarationInstruction extends DeclarationInstruction {
  constructor(
    public readonly id: import("../../base").InstructionId,
    public readonly place: Place,
    public readonly superClass: Place | null,
    public readonly elements: Place[],
    public emit = true,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ClassDeclarationInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ClassDeclarationInstruction,
      place,
      this.superClass,
      this.elements,
      this.emit,
    );
  }

  public rewrite(
    values: Map<Identifier, Place>,
    _options?: { rewriteDefinitions?: boolean },
  ): BaseInstruction {
    const newSuper = this.superClass ? this.superClass.rewrite(values) : null;
    const newElements = this.elements.map((e) => e.rewrite(values));
    const superChanged = newSuper !== this.superClass;
    const elementsChanged = newElements.some((e, i) => e !== this.elements[i]);
    if (!superChanged && !elementsChanged) {
      return this;
    }
    return new ClassDeclarationInstruction(
      this.id,
      this.place,
      newSuper,
      newElements,
      this.emit,
    );
  }

  public getOperands(): Place[] {
    const operands: Place[] = [];
    if (this.superClass !== null) operands.push(this.superClass);
    operands.push(...this.elements);
    return operands;
  }

  public override getDefs(): Place[] {
    return [this.place];
  }
}
