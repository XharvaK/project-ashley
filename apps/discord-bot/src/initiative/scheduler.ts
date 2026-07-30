import type { Client } from "discord.js";

import { config } from "../config.js";

import {

  checkHealth,

  commitInitiative,

  initiativeStatus,

  tickInitiative,

} from "../agent-client.js";

import {

  pauseProactiveRemote,

  resumeProactiveRemote,

} from "../agent-client.js";



let timer: ReturnType<typeof setInterval> | null = null;



export function startProactiveScheduler(client: Client): void {

  if (!config.proactiveEnabled) {

    console.log("[discord-bot] proactive scheduler disabled (PROACTIVE_ENABLED=false)");

    return;

  }

  const proactiveChannel = process.env.PROACTIVE_CHANNEL ?? "discord";
  if (proactiveChannel !== "discord") {
    console.log(
      `[discord-bot] proactive owned by ${proactiveChannel}; discord scheduler idle`,
    );
    return;
  }



  const intervalMs = config.proactiveCheckIntervalMin * 60 * 1000;

  console.log(

    `[discord-bot] proactive scheduler every ${config.proactiveCheckIntervalMin}m`,

  );



  const tick = async () => {

    try {

      const healthy = await checkHealth();

      if (!healthy) {

        console.log("[discord-bot] proactive skip: agent_unhealthy");

        return;

      }



      const status = await initiativeStatus();

      if (status.paused) {

        console.log("[discord-bot] proactive skip: paused");

        return;

      }



      const result = await tickInitiative();

      if (!result.shouldSend) {

        console.log(`[discord-bot] proactive skip: ${result.reason}`);

        return;

      }



      const user = await client.users.fetch(config.ownerId);

      const dm = await user.createDM();

      const sent = await dm.send(result.text);

      await commitInitiative({

        text: result.text,

        threadId: result.threadId,

        angle: result.angle,

        reason: result.reason,

        discordMessageId: sent.id,

      });

      console.log(

        `[discord-bot] proactive sent angle=${result.angle} len=${result.text.length}`,

      );

    } catch (err) {

      const code = (err as Error & { code?: string }).code;

      if (code === "initiative_skipped" || code === "chat_in_progress") {

        console.log(`[discord-bot] proactive skip: ${code}`);

        return;

      }

      console.warn("[discord-bot] proactive tick error:", err);

    }

  };



  void tick();

  timer = setInterval(() => void tick(), intervalMs);

}



export function stopProactiveScheduler(): void {

  if (timer) {

    clearInterval(timer);

    timer = null;

  }

}



export async function pauseProactive(): Promise<void> {

  await pauseProactiveRemote();

}



export async function resumeProactive(): Promise<void> {

  await resumeProactiveRemote();

}



export async function getProactiveStatus() {

  return initiativeStatus();

}


