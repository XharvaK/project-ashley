import { waitForStableService } from "./qualification-service-state.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  return value?.trim() || undefined;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (value === undefined) throw new Error(name + "_missing");
  return value;
}

async function main(): Promise<void> {
  const result = await waitForStableService({
    unit: requiredArgument("--unit"),
    expectedCgroupPath: requiredArgument("--expected-cgroup"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "blocked") {
    console.error("BLOCKED " + result.reason);
    process.exitCode = 77;
  }
}

main().catch((error) => {
  console.error(
    "BLOCKED service_state_unreadable " +
      (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 77;
});
