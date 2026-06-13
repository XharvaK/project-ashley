/** Extract 16-bit PCM from a WAV buffer (Orpheus returns audio/wav, not raw PCM). */
export function wavToPcm(wav: Uint8Array): {
  pcm: Uint8Array;
  sampleRate: number;
} {
  if (wav.byteLength < 44) {
    return { pcm: wav, sampleRate: 24000 };
  }

  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (o: number) =>
    String.fromCharCode(wav[o]!, wav[o + 1]!, wav[o + 2]!, wav[o + 3]!);

  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    return { pcm: wav, sampleRate: 24000 };
  }

  let sampleRate = 24000;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= wav.byteLength) {
    const chunkId = tag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkData = offset + 8;

    if (chunkId === "fmt " && chunkSize >= 16) {
      sampleRate = view.getUint32(chunkData + 4, true);
    } else if (chunkId === "data") {
      dataOffset = chunkData;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0) {
    return { pcm: wav.slice(44), sampleRate };
  }

  const end = Math.min(dataOffset + dataSize, wav.byteLength);
  let pcm = wav.slice(dataOffset, end);
  if (pcm.byteLength % 2 !== 0) {
    pcm = pcm.slice(0, pcm.byteLength - 1);
  }

  return { pcm, sampleRate };
}
