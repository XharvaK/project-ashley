import { ActivityType, type Client } from "discord.js";
import { checkHealth, curiosityStatus } from "./agent-client.js";

const REFRESH_MS = 10 * 60 * 1000;

export type DiscordPresence = {
  status: "online" | "idle";
  label: string;
};

let timer: ReturnType<typeof setInterval> | null = null;
let last: DiscordPresence = { status: "online", label: "up" };

/** Same string Discord is showing; chat uses this so she can own her status. */
export function getDiscordPresence(): DiscordPresence {
  return last;
}

/**
 * Only true things: whether her brain is actually reachable, and what her
 * reading loop actually did today. A rotating list of cute activity strings is
 * the same lie as claiming she read something she did not.
 */
async function apply(client: Client): Promise<void> {
  const healthy = await checkHealth();
  if (!healthy) {
    last = { status: "idle", label: "brain offline" };
    client.user?.setPresence({
      status: "idle",
      activities: [{ name: last.label, type: ActivityType.Custom }],
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

  last = { status: "online", label };
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
