/**
 * Doc types in fragments. Three lines in five seconds are one turn, not three,
 * and answering each separately is what makes a bot feel like a form handler.
 *
 * Fragments are merged rather than dropped: a dropped line never reaches the
 * agent at all, so it never reaches memory either.
 */
export class TurnBuffer<F, T> {
  private readonly buffers = new Map<
    string,
    { fragments: F[]; target: T }
  >();

  /** True when nothing was waiting yet, meaning the caller should queue a drain. */
  push(channelId: string, fragment: F, target: T): boolean {
    const existing = this.buffers.get(channelId);
    if (existing) {
      existing.fragments.push(fragment);
      existing.target = target;
      return false;
    }
    this.buffers.set(channelId, { fragments: [fragment], target });
    return true;
  }

  take(channelId: string): { fragments: F[]; target: T } | null {
    const buffered = this.buffers.get(channelId);
    if (!buffered) return null;
    this.buffers.delete(channelId);
    return buffered;
  }
}
