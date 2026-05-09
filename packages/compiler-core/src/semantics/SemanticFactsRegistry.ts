import { CallSemanticFact, SemanticFactsProvider, UnknownFact, ValueFact } from "./SemanticFacts";

/**
 * Ordered semantic fact provider chain.
 *
 * Providers are queried in registration order. The first provider that returns
 * a fact owns the answer; `undefined` means the provider does not model that
 * semantic case.
 */
export class SemanticFactsRegistry implements SemanticFactsProvider {
  constructor(private readonly providers: readonly SemanticFactsProvider[]) {}

  public resolveGlobal(name: string): ValueFact {
    for (const provider of this.providers) {
      const fact = provider.resolveGlobal?.(name);
      if (fact !== undefined) return fact;
    }

    return UnknownFact;
  }

  public resolveStaticProperty(base: ValueFact, key: string): ValueFact | undefined {
    for (const provider of this.providers) {
      const fact = provider.resolveStaticProperty?.(base, key);
      if (fact !== undefined) return fact;
    }

    return UnknownFact;
  }

  public evaluateCall(target: ValueFact, args: readonly ValueFact[]): CallSemanticFact | undefined {
    for (const provider of this.providers) {
      const fact = provider.evaluateCall?.(target, args);
      if (fact !== undefined) return fact;
    }

    return { result: UnknownFact };
  }

  public extend(provider: SemanticFactsProvider): SemanticFactsRegistry {
    return new SemanticFactsRegistry([...this.providers, provider]);
  }

  public static empty(): SemanticFactsRegistry {
    return new SemanticFactsRegistry([]);
  }

  public static from(providers: readonly SemanticFactsProvider[]): SemanticFactsRegistry {
    return new SemanticFactsRegistry(providers);
  }
}
