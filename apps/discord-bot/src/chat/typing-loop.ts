import type { TextBasedChannel } from "discord.js";

export async function runTypingLoop(
  channel: TextBasedChannel,
  until: () => boolean,
): Promise<() => void> {
  const send = () => {
    if ("sendTyping" in channel) void channel.sendTyping().catch(() => {});
  };
  send();
  const id = setInterval(send, 3000);
  const check = setInterval(() => {
    if (until()) {
      clearInterval(id);
      clearInterval(check);
    }
  }, 500);
  return () => {
    clearInterval(id);
    clearInterval(check);
  };
}
