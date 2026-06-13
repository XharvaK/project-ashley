import { loadOrpheusVoice } from "./config.js";
import { ORPHEUS_URL } from "./paths.js";
import { wavToPcm } from "./wav.js";

const DEFAULT_VOICE = loadOrpheusVoice();

const SENTENCE_END = /[.!?]+(?:\s|$)/;

export type TtsChunkHandler = (
  pcm: Uint8Array,
  sampleRate?: number,
) => void | Promise<void>;

/** Buffer streaming text and synthesize complete sentences via Orpheus. */
export class OrpheusStreamer {
  private buffer = "";
  private queue: Promise<void> = Promise.resolve();
  private voice: string;

  constructor(voice = DEFAULT_VOICE) {
    this.voice = voice;
  }

  feed(delta: string, onChunk: TtsChunkHandler): void {
    this.buffer += delta;
    this.drain(onChunk);
  }

  async flush(onChunk: TtsChunkHandler): Promise<void> {
    const rest = this.buffer.trim();
    this.buffer = "";
    if (rest) {
      await this.synthesize(rest, onChunk);
    }
    await this.queue;
  }

  private drain(onChunk: TtsChunkHandler): void {
    let match: RegExpExecArray | null;
    const re = new RegExp(SENTENCE_END.source, "g");
    let lastIndex = 0;
    while ((match = re.exec(this.buffer)) !== null) {
      const end = match.index + match[0].length;
      const sentence = this.buffer.slice(lastIndex, end).trim();
      lastIndex = end;
      if (sentence) {
        this.queue = this.queue.then(() => this.synthesize(sentence, onChunk));
      }
    }
    this.buffer = this.buffer.slice(lastIndex);
  }

  private async synthesize(text: string, onChunk: TtsChunkHandler): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${ORPHEUS_URL}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "orpheus",
          input: text,
          voice: this.voice,
          response_format: "wav",
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      console.error("[orpheus] TTS unreachable:", err instanceof Error ? err.message : err);
      return;
    }
    if (!res.ok) {
      console.error("[orpheus] TTS failed", res.status, await res.text().catch(() => ""));
      return;
    }

    const wav = new Uint8Array(await res.arrayBuffer());
    const { pcm, sampleRate } = wavToPcm(wav);
    if (pcm.length > 0) {
      await onChunk(pcm, sampleRate);
    }
  }
}

export async function speakOfflineMessage(text: string, onChunk: TtsChunkHandler): Promise<void> {
  const tts = new OrpheusStreamer();
  tts.feed(text, onChunk);
  await tts.flush(onChunk);
}
