type Job = () => Promise<void>;

export class ChannelQueue {
  private readonly queues = new Map<string, Promise<void>>();

  enqueue(channelId: string, job: Job): Promise<void> {
    const prev = this.queues.get(channelId) ?? Promise.resolve();
    const next = prev.then(job).catch((err) => {
      console.error(`[telegram-bot] queue error on ${channelId}:`, err);
    });
    this.queues.set(channelId, next);
    void next.finally(() => {
      if (this.queues.get(channelId) === next) {
        this.queues.delete(channelId);
      }
    });
    return next;
  }
}

export const channelQueue = new ChannelQueue();
