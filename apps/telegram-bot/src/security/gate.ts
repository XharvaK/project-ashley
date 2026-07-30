import { config } from "../config.js";

export function isOwner(telegramUserId: number | string): boolean {
  return String(telegramUserId) === config.telegramOwnerId;
}
