/* ------------------------------------------------------------------ */
/*  imports                                                           */
/* ------------------------------------------------------------------ */
import lamejs from "@breezystack/lamejs";
import type { TimerSettings } from "../components/Timer.vue";

import { sprites, spriteSrc, voices, type CueKey, type VoiceKey } from "./sound";

/* ⭐ NEW: deterministic timetable generator ------------------------- */
import { buildTimetable } from "../util/timeline";

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */
type VoiceCueEvent = {
  time: number;     // seconds from T0
  cue: CueKey;      // "Lift" | "Rest" | "3" | "2" | "1"
  voice?: VoiceKey;  // which voice bank to use
};

/** Map the raw `voiceCues.text` back to our sprite key set. */
function toCueKey(text: string): CueKey | null {
  if (text === "1" || text === "2" || text === "3") return text as CueKey;
  if (text.startsWith("Lift"))                                   return "Lift";
  if (text.startsWith("Rest"))                                   return "Rest";
  return null;   // ignore any cue we don’t have a sprite for
}

/** Build one merged, sorted cue timeline for any number of timers. */
function generateVoiceCueTimeline(timers: TimerSettings[]): VoiceCueEvent[] {
  const events: VoiceCueEvent[] = [];

  for (const t of timers) {
    const timetable = buildTimetable(t);

    for (const cue of timetable.voiceCues) {
      const key = toCueKey(cue.text);
      if (key !== null) {
        events.push({ time: cue.timestamp, cue: key, voice: t.voice });
      }
    }
  }

  return events
    .filter(e => e.time >= 0)
    .sort((a, b) => a.time - b.time);
}

/* ------------------------------------------------------------------ */
/*  unchanged MP3 & download logic                                    */
/* ------------------------------------------------------------------ */
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
    const s = Math.max(-1, Math.min(1, input[i]));   // clamp [-1, 1]
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

function encodeMp3(buffer: AudioBuffer, onProgress?: (p: number) => void): Blob {
  const samples  = buffer.getChannelData(0);
  const mp3      = new lamejs.Mp3Encoder(1, buffer.sampleRate, 128);
  const chunkSz  = 1152;
  const mp3Parts: BlobPart[] = [];

  for (let i = 0; i < samples.length; i += chunkSz) {
    const chunk    = samples.subarray(i, i + chunkSz);
    const int16    = floatTo16BitPCM(chunk);
    const mp3buf   = mp3.encodeBuffer(int16);
    if (mp3buf.length) mp3Parts.push(Uint8Array.from(mp3buf));
    if (onProgress) onProgress(Math.min(1, (i + chunkSz) / samples.length));
  }
  const final = mp3.flush();
  if (final.length) mp3Parts.push(Uint8Array.from(final));
  return new Blob(mp3Parts, { type: "audio/mpeg" });
}

function downloadMp3(blob: Blob, filename = "timer.mp3") {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement("a"), { href: url, download: filename, style: "display:none" });
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/* ------------------------------------------------------------------ */
/*  PUBLIC API: generateAudio                                         */
/* ------------------------------------------------------------------ */
export async function generateAudio(
  timers: TimerSettings[],
  onProgress?: (p: number) => void,
): Promise<void> {
  const events   = generateVoiceCueTimeline(timers);
  if (!events.length) return;                       // nothing to do

  /* figure out how long the offline context must be ---------------- */
  const lastEventTime = events[events.length-1]!.time;
  const longestBeep   = 0.36;                       // 2 × 180 ms (Lift/Rest)
  const duration      = Math.ceil(lastEventTime + longestBeep + 1); // +1 s pad
  const rate          = 44_100;

  /* fetch the voice-sprite MP3 once -------------------------------- */
  const spriteBuf = await decodeVoiceFile();

  const ctx = new OfflineAudioContext(1, duration * rate, rate);

  for (const e of events) {
    if (e.voice) {
      /* ------------------------------------------------------------- */
      /*  🎙  recorded voice                                           */
      /* ------------------------------------------------------------- */
      const [startMs, durMs] = sprites[voices[e.voice][e.cue]];
      const s0 = Math.floor((startMs         / 1000) * spriteBuf.sampleRate);
      const s1 = Math.floor(((startMs+durMs) / 1000) * spriteBuf.sampleRate);
      const len = s1 - s0;

      const slice = ctx.createBuffer(1, len, rate);
      slice.getChannelData(0).set(spriteBuf.getChannelData(0).subarray(s0, s1));

      const src = ctx.createBufferSource();
      src.buffer = slice;
      src.connect(ctx.destination);
      src.start(e.time);
    } else {
      /* ------------------------------------------------------------- */
      /*  🔔  synthetic beep(s)                                        */
      /* ------------------------------------------------------------- */
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.connect(gain).connect(ctx.destination);

      /* pick frequency & repetition pattern */
      let freq      : number;
      let repeats   : number;
      switch (e.cue) {
        case "Lift":
        case "Rest":
          freq    = 1000;
          repeats = 2;
          break;
        case "3": freq = 600;  repeats = 1; break;
        case "2": freq = 700;  repeats = 1; break;
        case "1": freq = 800;  repeats = 1; break;
        default:  continue;                // ignore unknown cue
      }

      const BEEP_MS = 180;
      const ATTACK  = 0.005;
      const RELEASE = 0.008;

      for (let i = 0; i < repeats; i++) {
        const start = e.time + i * (BEEP_MS / 1000);
        const stop  = start + BEEP_MS / 1000;

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(1, start + ATTACK);
        gain.gain.setValueAtTime(1, stop - RELEASE);
        gain.gain.linearRampToValueAtTime(0, stop);

        osc.frequency.setValueAtTime(freq, start);
      }
      osc.start(e.time);
      osc.stop(e.time + repeats * (BEEP_MS / 1000));
    }
  }

  /* render & encode ------------------------------------------------- */
  const rendered = await ctx.startRendering();
  const blob     = encodeMp3(rendered, onProgress);
  downloadMp3(blob);
}

