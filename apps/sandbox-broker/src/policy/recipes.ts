export interface BrokerRecipe {
  recipeId: string;
  executable: string;
  argv: string[];
  cwdPolicy: string;
  supported: boolean;
}

export const DEFAULT_TEST_RECIPES: BrokerRecipe[] = [
  {
    recipeId: "verify:agent-tsc",
    executable: "/bin/echo",
    argv: ["ok"],
    cwdPolicy: "workspace",
    supported: true,
  },
  {
    recipeId: "verify:repo-tsc",
    executable: "/bin/echo",
    argv: ["ok"],
    cwdPolicy: "workspace",
    supported: false,
  },
];

export function resolveRecipe(
  recipes: Map<string, BrokerRecipe>,
  recipeId: string,
): BrokerRecipe | undefined {
  return recipes.get(recipeId);
}
