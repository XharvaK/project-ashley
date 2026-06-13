export class SummaryBatchTooSmallError extends Error {
  constructor() {
    super("summary_batch_too_small");
    this.name = "SummaryBatchTooSmallError";
  }
}
