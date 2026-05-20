import { BlockId, makeBlockId } from "./Block";
import { FunctionId, makeFunctionId } from "./FunctionIR";
import { ModuleId, makeModuleId } from "./ModuleId";
import { OperationId, makeOperationId } from "./Operation";
import { makePrivateNameId, type PrivateNameId } from "./PrivateName";
import { DeclarationId, ValueId, makeDeclarationId, makeValueId } from "./Value";

/**
 * Allocates stable, unique identities for IR nodes.
 *
 * Ids are monotonically increasing within one compilation context. They are
 * used for diagnostics, maps, serialization, and deterministic printing; they
 * do not imply ownership, reachability, or program order.
 */
export class IRIdAllocator {
  #nextModuleId = 0;
  #nextFunctionId = 0;
  #nextBlockId = 0;
  #nextOperationId = 0;
  #nextValueId = 0;
  #nextDeclarationId = 0;
  #nextPrivateNameId = 0;

  public moduleId(): ModuleId {
    return makeModuleId(this.#nextModuleId++);
  }

  public functionId(): FunctionId {
    return makeFunctionId(this.#nextFunctionId++);
  }

  public blockId(): BlockId {
    return makeBlockId(this.#nextBlockId++);
  }

  public operationId(): OperationId {
    return makeOperationId(this.#nextOperationId++);
  }

  public valueId(): ValueId {
    return makeValueId(this.#nextValueId++);
  }

  public declarationId(): DeclarationId {
    return makeDeclarationId(this.#nextDeclarationId++);
  }

  public privateNameId(): PrivateNameId {
    return makePrivateNameId(this.#nextPrivateNameId++);
  }
}
