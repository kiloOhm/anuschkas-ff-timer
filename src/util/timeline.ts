/* ---------- TYPES ------------------------------------------------------ */

import type { TimerSettings } from "../components/Timer.vue";
import type { CueKey } from "./sound";

export const phases = ["on", "off"] as const;
export type PhaseKey = typeof phases[number];

export type PhaseEvent = {
  state: PhaseKey;
  timestamp: number;   // phase *start* (sec)
  duration: number;    // length of that phase
};

export type VoiceCue = {
  text: CueKey;        // "3" | "2" | "1" | "Lift!" | "Rest!"
  timestamp: number;   // when to play it (sec)
};

export type RoundCue = {
  round: number;       // 1-based
  timestamp: number;   // start of the round (sec)
};

export type Timetable = {
  /** All on/off blocks in temporal order */
  phases: PhaseEvent[];
  /** Spoken hints in the order you can stream them out */
  voiceCues: VoiceCue[];
  /** “Round N” beeps or overlays */
  rounds: RoundCue[];
  /** Full length of the workout, sec */
  totalDuration: number;
};

export type RuntimeStatus = {
  /** `"on"` when lifting, `"off"` when resting                         */
  state: PhaseKey;
  /** Seconds elapsed in the current phase                              */
  timeInPhase: number;
  /** Whole seconds left until the phase changes                        */
  remainingSeconds: number;
  /** 1-based round index (0 = before the workout, > rounds = finished) */
  currentRound: number;
  /** The next voice cue to fire, or `null` if there is none left       */
  nextVoiceCue: VoiceCue | null;
};

/* ---------- IMPLEMENTATION --------------------------------------------- */

export function buildTimetable(settings: TimerSettings): Timetable {
  const { offset, onTime, offTime, rounds } = settings;
  const cycleTime      = onTime + offTime;
  const totalDuration  = offset + rounds * cycleTime;

  const phases: PhaseEvent[] = [];
  const voiceCues: VoiceCue[] = [];
  const roundsTrack: RoundCue[] = [];

  /* 1️⃣  OPTIONAL INITIAL REST PHASE (before round 1) */
  if (offset > 0) {
    phases.push({ state: "off", timestamp: 0, duration: offset });
    // treat it like “rest” for audio guidance
    voiceCues.push({ text: "Rest", timestamp: 0 });
  }

  /* 2️⃣  EVERY LIFT / REST CYCLE */
  let t = offset;                           // cursor along the timeline

  for (let r = 1; r <= rounds; r++) {
    /* ---- LIFT (ON) ------- */
    const liftStart = t;
    phases.push({ state: "on", timestamp: liftStart, duration: onTime });

    // round counter fires *exactly* at lift start
    roundsTrack.push({ round: r, timestamp: liftStart });

    // countdown 3-2-1 (skip anything that would fall before 0)
    [3, 2, 1].forEach(n => {
      if (liftStart - n >= 0) {
        voiceCues.push({ text: String(n) as CueKey, timestamp: liftStart - n });
      }
    });

    // “Lift!” at the moment we enter the on-phase
    voiceCues.push({ text: "Lift", timestamp: liftStart });

    t += onTime;                            // advance time cursor

    /* ---- REST (OFF) ------- */
    const restStart = t;
    phases.push({ state: "off", timestamp: restStart, duration: offTime });

    // “Rest!” exactly when rest begins
    voiceCues.push({ text: "Rest", timestamp: restStart });

    t += offTime;                           // advance to next cycle
  }

  /* 3️⃣  SORT VOICE CUES (if you care about order) */
  voiceCues.sort((a, b) => a.timestamp - b.timestamp);

  return { phases, voiceCues, rounds: roundsTrack, totalDuration };
}

/**
 * Look-up helper for ⏱ state at any point in time.
 *
 * @param timetable – result of `buildTimetable`
 * @param t         – seconds since start (can be negative or beyond the end)
 */
export function getRuntimeStatus(
  timetable: Timetable,
  t: number,
): RuntimeStatus {
  const { phases, rounds, voiceCues, totalDuration } = timetable;

  /* --- 1.  BEFORE THE WORKOUT OR AFTER IT IS OVER ------------------ */

  if (t < 0) {
    return {
      state: "off",
      timeInPhase: 0,
      remainingSeconds: Math.ceil(-t),
      currentRound: 0,
      nextVoiceCue: voiceCues.length ? voiceCues[0] : null,
    };
  }

  if (t >= totalDuration) {
    return {
      state: "off",
      timeInPhase: 0,
      remainingSeconds: 0,
      currentRound: rounds.length + 1,   // “workout completed”
      nextVoiceCue: null,
    };
  }

  /* --- 2.  BINARY-SEARCH THE PHASE LIST ---------------------------- */

  // phases are sorted by timestamp so we can binary-search
  let lo = 0;
  let hi = phases.length - 1;
  let phase: PhaseEvent = phases[0];      // fallback

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const p = phases[mid];
    if (t < p.timestamp) {
      hi = mid - 1;
    } else if (t >= p.timestamp + p.duration) {
      lo = mid + 1;
    } else {
      phase = p;
      break;
    }
  }

  const timeInPhase = t - phase.timestamp;
  const remainingSeconds = Math.ceil(phase.duration - timeInPhase);

  /* --- 3.  CURRENT ROUND ------------------------------------------- */

  // rounds[] is sorted too → last round whose timestamp ≤ t
  let currentRound = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (t >= rounds[i].timestamp) {
      currentRound = rounds[i].round;
      break;
    }
  }

  /* --- 4.  NEXT VOICE CUE ------------------------------------------ */

  let nextVoiceCue: VoiceCue | null = null;
  for (const cue of voiceCues) {
    if (cue.timestamp > t) {
      nextVoiceCue = cue;
      break;
    }
  }

  return {
    state: phase.state,
    timeInPhase,
    remainingSeconds,
    currentRound,
    nextVoiceCue,
  };
}