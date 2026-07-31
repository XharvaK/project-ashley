/**
 * Leaf module: zero project imports. Lets consolidator and curiosity yield while
 * a chat turn holds the interactive lane, without importing ChatService.
 */
let busy = false;

export function setTurnBusy(v: boolean): void {
  busy = v;
}

export function isTurnBusy(): boolean {
  return busy;
}
