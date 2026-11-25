/** A knapsack candidate and its property tokens, such as weight and value. */
export class Object {
  constructor(public readonly name: string, public readonly tokens: Record<string, number>) {}

  tokenCount(property: string) { return Number(this.tokens[property]) || 0; }
}
