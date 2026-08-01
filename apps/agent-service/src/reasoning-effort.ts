export type ReasoningEffort = "medium" | "high";

const SUBSTANCE_PATTERNS = [
  /\b(safe|danger|interact|contraindic|serotonin|dose|combin|mix|stack)\b/i,
  /\b(bug|error|crash|fail|broken|debug|fix|why does|why is)\b/i,
  /\b(should I|would you|which|better|trade-?off|pros? and cons?|compare)\b/i,
  /\b(how does|how do|explain|mechanism|works?)\b/i,
  /\b(code|function|class|module|import|export|async|await|promise)\b/i,
  /\b(premise|since|because|given that|now that|assuming)\b/i,
];

export function classifyReasoningEffort(params: {
  queryMode: string;
  message: string;
  activityAsk: boolean;
}): ReasoningEffort {
  const { queryMode, message, activityAsk } = params;
  const trimmed = message.trim();

  if (queryMode === "recall" || queryMode === "soft_recall" || activityAsk) {
    return "high";
  }

  if (SUBSTANCE_PATTERNS.some((p) => p.test(trimmed))) {
    return "high";
  }

  return "medium";
}

export function selectTemperature(params: {
  queryMode: string;
  channel: string;
  reasoningEffort: ReasoningEffort;
  recallTemperature: number;
  voiceTemperature: number;
  chatTemperature: number;
}): number {
  if (params.queryMode === "recall") return params.recallTemperature;
  if (params.channel === "voice") return params.voiceTemperature;
  if (params.reasoningEffort === "high") return 0.5;
  return params.chatTemperature;
}
