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
  | 'gameStart'
  | 'pass';

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

// Sound definitions - subtle and non-intrusive
// Each sound has a base volume that gets multiplied by the user's volume setting
const soundDefinitions: Record<SoundType, (ctx: AudioContext, volumeMultiplier: number) => void> = {
  tileClick: (ctx, vol) => {
    // Short soft click
    createOscillatorSound(ctx, 600, 0.03, 'sine', 0.08 * vol);
  },

  tileSelect: (ctx, vol) => {
    // Gentle selection tone
    createOscillatorSound(ctx, 500, 0.06, 'sine', 0.1 * vol);
  },

  discard: (ctx, vol) => {
    // Soft thud
    createOscillatorSound(ctx, 150, 0.08, 'sine', 0.12 * vol);
  },

  draw: (ctx, vol) => {
    // Gentle pickup sound
    createOscillatorSound(ctx, 400, 0.06, 'sine', 0.08 * vol);
  },

  pung: (ctx, vol) => {
    // Subtle two-tone
    playNoteSequence(ctx, [
      { freq: 440, duration: 0.08, delay: 0 },
      { freq: 550, duration: 0.1, delay: 0.06 },
    ], 'sine', 0.12 * vol);
  },

  chow: (ctx, vol) => {
    // Soft ascending
    playNoteSequence(ctx, [
      { freq: 400, duration: 0.06, delay: 0 },
      { freq: 500, duration: 0.08, delay: 0.05 },
    ], 'sine', 0.1 * vol);
  },

  win: (ctx, vol) => {
    // Pleasant but subtle win sound
    playNoteSequence(ctx, [
      { freq: 523, duration: 0.1, delay: 0 },       // C5
      { freq: 659, duration: 0.1, delay: 0.08 },    // E5
      { freq: 784, duration: 0.15, delay: 0.16 },   // G5
    ], 'sine', 0.15 * vol);
  },

  yourTurn: (ctx, vol) => {
    // Gentle notification chime
    createOscillatorSound(ctx, 660, 0.12, 'sine', 0.1 * vol);
  },

  gameStart: (ctx, vol) => {
    // Soft start tone
    playNoteSequence(ctx, [
      { freq: 400, duration: 0.1, delay: 0 },
      { freq: 500, duration: 0.15, delay: 0.08 },
    ], 'sine', 0.1 * vol);
  },

  pass: (ctx, vol) => {
    // Very subtle pass
    createOscillatorSound(ctx, 250, 0.05, 'sine', 0.05 * vol);
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
