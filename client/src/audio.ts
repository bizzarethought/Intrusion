import { useSyncExternalStore } from 'react';

// Sound hooks. Short synthesised blips for now; swap `SOUNDS` for real audio
// files later without touching the callers.

/** [start pitch Hz, end pitch Hz, seconds, wave] */
const SOUNDS = {
  click: [520, 660, 0.07, 'triangle'],
  join: [440, 880, 0.18, 'triangle'],
  phase: [330, 495, 0.25, 'sine'],
  go: [660, 990, 0.15, 'square'],
  stop: [300, 180, 0.22, 'square'],
  caught: [220, 90, 0.35, 'sawtooth'],
  score: [660, 1320, 0.3, 'triangle'],
  vote: [392, 262, 0.2, 'triangle'],
  alarm: [880, 440, 0.4, 'sawtooth'],
  reveal: [110, 55, 0.9, 'sawtooth'],
} as const satisfies Record<string, readonly [number, number, number, OscillatorType]>;

// Music the team picked for each part of the game, and the glitch effect.
const TRACKS = {
  menu: 'magic-puzzle-loop.ogg',
  lobby: 'soulfully-loop.ogg',
  minigame: 'cozy-puzzle-loop.ogg',
  voting: '70s-spy-game-loop.ogg',
} as const;
export type Track = keyof typeof TRACKS;
const MUSIC_VOLUME = 0.35;

let context: AudioContext | null = null;
let muted = localStorage.getItem('intrusion-muted') === '1';
const listeners = new Set<() => void>();

export function play(name: keyof typeof SOUNDS) {
  if (muted) return;
  try {
    context ??= new AudioContext();
    const [from, to, seconds, wave] = SOUNDS[name];
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + seconds);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + seconds);
  } catch {
    // Audio is a nice-to-have; never let it break the game.
  }
}

const players = new Map<Track, HTMLAudioElement>();
let wanted: Track | null = null;

/** Switches the background music (null for silence). Tracks fade over half a second. */
export function setMusic(track: Track | null) {
  wanted = track;
  if (track && !players.has(track)) {
    const audio = new Audio(`/assets/audio/${TRACKS[track]}`);
    audio.loop = true;
    audio.volume = 0;
    players.set(track, audio);
  }
  // Browsers refuse to start sound before the first click; try again then.
  if (track && !muted) players.get(track)!.play().catch(() => addEventListener('pointerdown', () => setMusic(wanted), { once: true }));
}
setInterval(() => {
  for (const [track, audio] of players) {
    const target = track === wanted && !muted ? MUSIC_VOLUME : 0;
    audio.volume = Math.max(0, Math.min(1, audio.volume + Math.sign(target - audio.volume) * Math.min(0.035, Math.abs(target - audio.volume))));
    if (audio.volume === 0 && !audio.paused && track !== wanted) audio.pause();
  }
}, 50);

/** The corrupted-glitch effect: used when the AI shows itself. */
export function playGlitch() {
  if (muted) return null;
  const audio = new Audio('/assets/audio/Intrusion-Corrupted-Glitch-10s.wav');
  audio.volume = 0.6;
  audio.play().catch(() => {});
  return audio;
}

export function toggleMuted() {
  muted = !muted;
  setMusic(wanted);
  localStorage.setItem('intrusion-muted', muted ? '1' : '0');
  listeners.forEach((listener) => listener());
}

export const useMuted = () =>
  useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => muted);

/** True when the visitor asked their system for less motion. */
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
