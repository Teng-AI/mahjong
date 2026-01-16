'use client';

import { useCallback, useRef, useState } from 'react';

// Sound types available in the game
export type SoundType =
  | 'tileClick'
  | 'tileSelect'
  | 'discard'
  | 'draw'
  | 'pung'
  | 'chow'
  | 'win'
  | 'yourTurn'
  | 'callAlert'
  | 'gameStart'
  | 'pass'
  | 'timerWarning';

interface UseSoundsReturn {
  playSound: (type: SoundType) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  volume: number;
  setVolume: (volume: number) => void;
}

// Generate sounds using Web Audio API
function createOscillatorSound(
  audioContext: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.3
): void {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

  // Envelope for smoother sound
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

// Play a sequence of notes
function playNoteSequence(
  audioContext: AudioContext,
  notes: { freq: number; duration: number; delay: number }[],
  type: OscillatorType = 'sine',
  volume: number = 0.3
): void {
  notes.forEach(({ freq, duration, delay }) => {
    setTimeout(() => {
      createOscillatorSound(audioContext, freq, duration, type, volume);
    }, delay * 1000);
  });
}

// Sound definitions
// Each sound has a base volume that gets multiplied by the user's volume setting
const soundDefinitions: Record<SoundType, (ctx: AudioContext, volumeMultiplier: number) => void> = {
  tileClick: (ctx, vol) => {
    // Short click
    createOscillatorSound(ctx, 600, 0.03, 'sine', 0.25 * vol);
  },

  tileSelect: (ctx, vol) => {
    // Selection tone
    createOscillatorSound(ctx, 500, 0.06, 'sine', 0.3 * vol);
  },

  discard: (ctx, vol) => {
    // Thud
    createOscillatorSound(ctx, 150, 0.08, 'sine', 0.35 * vol);
  },

  draw: (ctx, vol) => {
    // Pickup sound
    createOscillatorSound(ctx, 400, 0.06, 'sine', 0.25 * vol);
  },

  pung: (ctx, vol) => {
    // Two-tone
    playNoteSequence(ctx, [
      { freq: 440, duration: 0.08, delay: 0 },
      { freq: 550, duration: 0.1, delay: 0.06 },
    ], 'sine', 0.35 * vol);
  },

  chow: (ctx, vol) => {
    // Ascending
    playNoteSequence(ctx, [
      { freq: 400, duration: 0.06, delay: 0 },
      { freq: 500, duration: 0.08, delay: 0.05 },
    ], 'sine', 0.3 * vol);
  },

  win: (ctx, vol) => {
    // Celebratory victory fanfare - longer triumphant melody
    // First phrase - ascending fanfare
    playNoteSequence(ctx, [
      { freq: 523, duration: 0.12, delay: 0 },       // C5
      { freq: 659, duration: 0.12, delay: 0.1 },     // E5
      { freq: 784, duration: 0.12, delay: 0.2 },     // G5
      { freq: 1047, duration: 0.3, delay: 0.3 },     // C6 (hold)
    ], 'sine', 0.45 * vol);
    // Second phrase - triumphant resolution
    playNoteSequence(ctx, [
      { freq: 880, duration: 0.15, delay: 0.7 },     // A5
      { freq: 988, duration: 0.15, delay: 0.85 },    // B5
      { freq: 1047, duration: 0.2, delay: 1.0 },     // C6
      { freq: 1319, duration: 0.4, delay: 1.2 },     // E6 (high)
    ], 'sine', 0.4 * vol);
    // Third phrase - celebratory flourish
    playNoteSequence(ctx, [
      { freq: 1047, duration: 0.1, delay: 1.7 },     // C6
      { freq: 1175, duration: 0.1, delay: 1.8 },     // D6
      { freq: 1319, duration: 0.1, delay: 1.9 },     // E6
      { freq: 1568, duration: 0.5, delay: 2.0 },     // G6 (finale)
    ], 'sine', 0.5 * vol);
    // Bass accompaniment
    playNoteSequence(ctx, [
      { freq: 262, duration: 0.3, delay: 0 },        // C4
      { freq: 330, duration: 0.3, delay: 0.7 },      // E4
      { freq: 392, duration: 0.3, delay: 1.2 },      // G4
      { freq: 523, duration: 0.6, delay: 1.7 },      // C5
    ], 'sine', 0.25 * vol);
  },

  yourTurn: (ctx, vol) => {
    // Attention-grabbing double chime
    playNoteSequence(ctx, [
      { freq: 880, duration: 0.15, delay: 0 },       // A5 - first chime
      { freq: 1100, duration: 0.12, delay: 0.12 },   // ~C#6 - rising
      { freq: 880, duration: 0.15, delay: 0.35 },    // A5 - second chime
      { freq: 1100, duration: 0.18, delay: 0.47 },   // ~C#6 - rising finish
    ], 'sine', 0.45 * vol);
  },

  callAlert: (ctx, vol) => {
    // Urgent triple-beep alert for calling opportunities
    playNoteSequence(ctx, [
      { freq: 1000, duration: 0.08, delay: 0 },      // First beep
      { freq: 1000, duration: 0.08, delay: 0.12 },   // Second beep
      { freq: 1200, duration: 0.12, delay: 0.24 },   // Third beep (higher)
      { freq: 800, duration: 0.06, delay: 0.38 },    // Low accent
      { freq: 1200, duration: 0.15, delay: 0.46 },   // Final high
    ], 'square', 0.1 * vol);
  },

  gameStart: (ctx, vol) => {
    // Start tone
    playNoteSequence(ctx, [
      { freq: 400, duration: 0.1, delay: 0 },
      { freq: 500, duration: 0.15, delay: 0.08 },
    ], 'sine', 0.3 * vol);
  },

  pass: (ctx, vol) => {
    // Subtle pass
    createOscillatorSound(ctx, 250, 0.05, 'sine', 0.15 * vol);
  },

  timerWarning: (ctx, vol) => {
    // Urgent warning beeps for low time on calling phase timer
    playNoteSequence(ctx, [
      { freq: 800, duration: 0.1, delay: 0 },       // First beep
      { freq: 800, duration: 0.1, delay: 0.15 },    // Second beep
      { freq: 1000, duration: 0.15, delay: 0.3 },   // Higher urgent beep
    ], 'square', 0.3 * vol);
  },
};

export function useSounds(): UseSoundsReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  // Initialize from localStorage if available (client-side only)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('mahjong-sound-enabled');
    return stored === null ? true : stored === 'true';
  });

  const [volume, setVolumeState] = useState(() => {
    if (typeof window === 'undefined') return 1.0;
    const stored = localStorage.getItem('mahjong-sound-volume');
    return stored === null ? 1.0 : parseFloat(stored);
  });

  // Set volume and persist to localStorage
  const setVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
    localStorage.setItem('mahjong-sound-volume', String(clampedVolume));
  }, []);

  // Initialize AudioContext on first user interaction
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    // Resume if suspended (browsers require user interaction)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Play a sound
  const playSound = useCallback((type: SoundType) => {
    if (!soundEnabled) return;

    try {
      const ctx = getAudioContext();
      const soundFn = soundDefinitions[type];
      if (soundFn) {
        soundFn(ctx, volume);
      }
    } catch (err) {
      console.warn('Sound playback failed:', err);
    }
  }, [soundEnabled, getAudioContext, volume]);

  // Toggle sound on/off
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('mahjong-sound-enabled', String(newValue));
      return newValue;
    });
  }, []);

  return {
    playSound,
    soundEnabled,
    toggleSound,
    volume,
    setVolume,
  };
}
