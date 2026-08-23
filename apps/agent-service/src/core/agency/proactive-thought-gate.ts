/**
 * Proactive model Thought is expensive groq-120b traffic on the same TPM
 * bucket as live Discord Thought. M2 being offerable must not by itself
 * dispatch undeadlined proactive Thought: that starves the 6s reactive
 * Thought window (`deadline_before_dispatch`) and makes live inspection
 * unreachable even though the capability is active.
 *
 * Reactive Discord already admits model Thought when inspection is offered.
 * Proactive 120b Thought remains for hard complexity only.
 */
export function shouldRunProactiveModelThought(complexityMode: string): boolean {
  return complexityMode === "hard";
}
