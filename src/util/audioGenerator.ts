import lamejs from "@breezystack/lamejs";
import type { TimerSettings } from "../components/Timer.vue";
import { sprites, spriteSrc, voices, type CueKey, type VoiceKey } from "./sound";

type VoiceCueEvent = {
  time: number;
  cue: CueKey;
  voice: VoiceKey;
};

function generateVoiceCueTimeline(timers: TimerSettings[]): VoiceCueEvent[] {
  const events: VoiceCueEvent[] = [];

  for (const settings of timers) {
    const { offset, onTime, offTime, rounds, voice } = settings;
    const cycleTime = onTime + offTime;

    // ✅ Add countdown at the end of offset
    for (let i = 3; i >= 1; i--) {
      events.push({
        time: offset - i,
        cue: `${i}` as CueKey,
        voice
      });
    }

    for (let round = 0; round < rounds; round++) {
      const base = offset + round * cycleTime;

      // "Lift" and countdown at the end of on phase
      events.push({ time: base, cue: "Lift", voice });
      for (let i = 3; i >= 1; i--) {
        events.push({
          time: base + onTime - i,
          cue: `${i}` as CueKey,
          voice
        });
      }

      // "Rest" and countdown at the end of off phase
      events.push({ time: base + onTime, cue: "Rest", voice });
      for (let i = 3; i >= 1; i--) {
        events.push({
          time: base + onTime + offTime - i,
          cue: `${i}` as CueKey,
          voice
        });
      }
    }
  }

  return events
    .filter(e => e.time >= 0) // remove any pre-0 cues (if offset < 3)
    .sort((a, b) => a.time - b.time);
}

const url = spriteSrc[0];

async function decodeVoiceFile(): Promise<AudioBuffer> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 44100);
  return await ctx.decodeAudioData(buffer);
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    let s = Math.max(-1, Math.min(1, input[i])); // clamp to [-1, 1]
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

function encodeMp3(buffer: AudioBuffer, onProgress?: (progress: number) => void): Blob {
  const samples = buffer.getChannelData(0);
  const mp3 = new lamejs.Mp3Encoder(1, buffer.sampleRate, 128);

  const chunkSize = 1152;
  const mp3Data: BlobPart[] = [];

  console.log("Encoding MP3 with chunk size:", chunkSize);
  for (let i = 0; i < samples.length; i += chunkSize) {
    const chunk = samples.subarray(i, i + chunkSize);
    const int16Chunk = floatTo16BitPCM(chunk);
    const mp3buf = mp3.encodeBuffer(int16Chunk);
    if (mp3buf.length > 0) mp3Data.push(Uint8Array.from(mp3buf));
    if (onProgress) {
      const progress = Math.min(1, (i + chunkSize) / samples.length);
      onProgress(progress);
    }
  }

  const final = mp3.flush();
  if (final.length > 0) mp3Data.push(Uint8Array.from(final));

  console.log("Finished encoding MP3, total chunks:", mp3Data.length);
  return new Blob(mp3Data, { type: "audio/mpeg" });
}

function downloadMp3(blob: Blob, filename: string = "timer.mp3") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url); // cleanup
}

export async function generateAudio(timers: TimerSettings[], onProgress?: (progress: number) => void): Promise<void> {
  const events = generateVoiceCueTimeline(timers);
  console.log("Generated voice cue timeline:", events);
  const duration = Math.ceil(events[events.length - 1]?.time ?? 0) + 2;
  console.log("Total duration for audio:", duration, "seconds");
  const sampleRate = 44100;

  const spriteBuffer = await decodeVoiceFile();
  console.log("Decoded voice file: ", spriteBuffer.length, "samples");
  const ctx = new OfflineAudioContext(1, duration * sampleRate, sampleRate);
  console.log("Created OfflineAudioContext with duration:", duration, "seconds");

  console.log("Starting to process events...");
  for (const event of events) {
    const [startMs, durationMs] = sprites[voices[event.voice][event.cue]];
    const startSample = Math.floor((startMs / 1000) * spriteBuffer.sampleRate);
    const endSample = Math.floor(((startMs + durationMs) / 1000) * spriteBuffer.sampleRate);
    const length = endSample - startSample;
    console.log(`Processing event at ${event.time}s: ${event.cue} (${startMs}ms to ${startMs + durationMs}ms)`);

    const slice = ctx.createBuffer(1, length, sampleRate);
    const sourceData = spriteBuffer.getChannelData(0).subarray(startSample, endSample);
    slice.getChannelData(0).set(sourceData);
    console.log(`Created audio slice of length ${length} samples for event at ${event.time}s`);

    const src = ctx.createBufferSource();
    src.buffer = slice;
    src.connect(ctx.destination);
    src.start(event.time);
    console.log(`Scheduled audio slice to start at ${event.time}s`);
  }

  console.log("All events processed, starting rendering...");
  const finalBuffer = await ctx.startRendering();
  const blob = encodeMp3(finalBuffer, onProgress);
  downloadMp3(blob);
}