import { ActivityType, type Client } from "discord.js";
import { checkHealth, curiosityStatus } from "./agent-client.js";

const REFRESH_MS = 10 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Only true things: whether her brain is actually reachable, and what her
 * reading loop actually did today. A rotating list of cute activity strings is
 * the same lie as claiming she read something she did not.
 */
async function apply(client: Client): Promise<void> {
  const healthy = await checkHealth();
  if (!healthy) {
    client.user?.setPresence({
      status: "idle",
      activities: [{ name: "brain offline", type: ActivityType.Custom }],
    });
    return;
  }

  let label = "up";
  try {
    const status = await curiosityStatus();
    if (status.takesToday > 0) {
      label = `read ${status.readToday || status.takesToday} things today`;
    }
  } catch {
    // Health is what matters here; a missing curiosity status is not worth a lie.
  }

  client.user?.setPresence({
    status: "online",
    activities: [{ name: label, type: ActivityType.Custom }],
  });
}

export function startPresence(client: Client): void {
  void apply(client);
  timer = setInterval(() => void apply(client), REFRESH_MS);
}

export function stopPresence(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
