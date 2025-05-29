import { Howl } from 'howler';

export const spriteSrc = ['/voices.mp3'];
const endRegister = new Map<number, (id: number) => void>();
const errorRegister = new Map<number, (id: number, error: unknown) => void>();

let howlInstance = null as Howl | null;

export function useSound() {
  if (howlInstance == null) {
    howlInstance = new Howl({
      src: spriteSrc,
      preload: true,
      sprite: sprites as unknown as Record<string, [number, number]>,
      onunlock: () => {
        console.log('Sound unlocked');
      },
      onloaderror: (id, error) => {
        console.error(`Error loading sound: ${id}`, error);
      },
      onload: () => {
        console.log('Sound loaded successfully');
      },
      onend: (id) => {
        const handler = endRegister.get(id);
        if (handler) {
          handler(id);
          endRegister.delete(id);
        }
      },
      onplayerror: (id, error) => {
        console.error(`Error playing sound: ${id}`, error);
        const handler = errorRegister.get(id);
        if (handler) {
          handler(id, error);
          errorRegister.delete(id);
        }
      }
    });
  }
  return {
    play(voice: VoiceKey, type: keyof Voice): Promise<void> {
      return new Promise((resolve, reject) => {
        if(howlInstance == null) {
          return reject(new Error("Sound not initialized"));
        }
        const soundId = howlInstance.play(voices[voice][type]);
        function endHandler(id: number) {
          if (id === soundId) {
            endRegister.delete(soundId);
            errorRegister.delete(soundId);
            resolve();
          }
        }
        endRegister.set(soundId, endHandler);
        function errorHandler(id: number, error: unknown) {
          if (id === soundId) {
            endRegister.delete(soundId);
            errorRegister.delete(soundId);
            reject(error);
          }
        }
        errorRegister.set(soundId, errorHandler);
      });
    }
  }
}

export const sprites = {
    M1_3: [0, 485],
    M1_2: [485, 459],
    M1_1: [944, 462],
    M1_Lift: [1406, 450],
    M1_Rest: [1856, 535],
    M2_3: [2391, 423],
    M2_2: [2815, 382],
    M2_1: [3197, 495],
    M2_Lift: [3692, 427],
    M2_Rest: [4118, 522],
    M3_3: [4640, 377],
    M3_2: [5017, 301],
    M3_1: [5319, 357],
    M3_Lift: [5675, 424],
    M3_Rest: [6100, 453],
    M4_3: [6553, 404],
    M4_2: [6957, 396],
    M4_1: [7354, 400],
    M4_Lift: [7754, 385],
    M4_Rest: [8139, 404],
    F1_3: [8543, 310],
    F1_2: [8853, 378],
    F1_1: [9231, 306],
    F1_Lift: [9537, 434],
    F1_Rest: [9971, 450],
    F2_3: [10421, 420],
    F2_2: [10842, 460],
    F2_1: [11302, 440],
    F2_Lift: [11742, 476],
    F2_Rest: [12218, 453],
    F3_3: [12671, 629],
    F3_2: [13300, 382],
    F3_1: [13681, 377],
    F3_Lift: [14058, 570],
    F3_Rest: [14628, 674],
    F4_3: [15301, 401],
    F4_2: [15703, 386],
    F4_1: [16089, 401],
    F4_Lift: [16491, 500],
    F4_Rest: [16991, 505],
  } as const;

export type Voice = Record<CueKey, keyof typeof sprites>;

export const cueKeys = ['3', '2', '1', 'Lift', 'Rest'] as const;
export type CueKey = typeof cueKeys[number];

export const voiceKeys = ["M1", "M2", "M3", "M4", "F1", "F2", "F3", "F4"] as const;
export type VoiceKey = typeof voiceKeys[number];

export const voices: Record<VoiceKey, Voice> = {
  M1: {
    '3': 'M1_3',
    '2': 'M1_2',
    '1': 'M1_1',
    Lift: 'M1_Lift',
    Rest: 'M1_Rest',
  },
  M2: {
    '3': 'M2_3',
    '2': 'M2_2',
    '1': 'M2_1',
    Lift: 'M2_Lift',
    Rest: 'M2_Rest',
  },
  M3: {
    '3': 'M3_3',
    '2': 'M3_2',
    '1': 'M3_1',
    Lift: 'M3_Lift',
    Rest: 'M3_Rest',
  },
  M4: {
    '3': 'M4_3',
    '2': 'M4_2',
    '1': 'M4_1',
    Lift: 'M4_Lift',
    Rest: 'M4_Rest',
  },
  F1: {
    '3': 'F1_3',
    '2': 'F1_2',
    '1': 'F1_1',
    Lift: 'F1_Lift',
    Rest: 'F1_Rest',
  },
  F2: {
    '3': 'F2_3',
    '2': 'F2_2',
    '1': 'F2_1',
    Lift: 'F2_Lift',
    Rest: 'F2_Rest',
  },
  F3: {
    '3': 'F3_3',
    '2': 'F3_2',
    '1': 'F3_1',
    Lift: 'F3_Lift',
    Rest: 'F3_Rest',
  },
  F4: {
    '3': 'F4_3',
    '2': 'F4_2',
    '1': 'F4_1',
    Lift: 'F4_Lift',
    Rest: 'F4_Rest',
  },
} as const;
