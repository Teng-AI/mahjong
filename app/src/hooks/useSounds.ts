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
  | 'winA'  // Simple chime
  | 'winB'  // Soft gong
  | 'winC'  // Rising sparkle
  | 'winD'  // Short victory
  | 'winE'  // Bell tone
  | 'yourTurn'
  | 'callAlert'
  | 'gameStart'
  | 'pass'
  | 'timerWarning'
  | 'drumroll';

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
    // Short click - subtle, happens constantly
    createOscillatorSound(ctx, 600, 0.03, 'sine', 0.10 * vol);
  },

  tileSelect: (ctx, vol) => {
    // Selection tone - subtle ambient feedback
    createOscillatorSound(ctx, 500, 0.06, 'sine', 0.15 * vol);
  },

  discard: (ctx, vol) => {
    // Thud - routine action feedback
    createOscillatorSound(ctx, 150, 0.08, 'sine', 0.25 * vol);
  },

  draw: (ctx, vol) => {
    // Pickup sound - routine action feedback
    createOscillatorSound(ctx, 400, 0.06, 'sine', 0.20 * vol);
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
    // Short Victory - punchy 3-note triumph (climax sound)
    playNoteSequence(ctx, [
      { freq: 392, duration: 0.1, delay: 0 },       // G4
      { freq: 523, duration: 0.1, delay: 0.1 },     // C5
      { freq: 659, duration: 0.35, delay: 0.2 },    // E5 (hold)
    ], 'sine', 0.55 * vol);
    // Bass punch
    createOscillatorSound(ctx, 131, 0.2, 'sine', 0.33 * vol);  // C3
  },

  // Option A: Simple Chime - clean two-note chime
  winA: (ctx, vol) => {
    playNoteSequence(ctx, [
      { freq: 880, duration: 0.15, delay: 0 },       // A5
      { freq: 1320, duration: 0.3, delay: 0.12 },    // E6
    ], 'sine', 0.5 * vol);
    // Subtle harmonic
    playNoteSequence(ctx, [
      { freq: 1760, duration: 0.2, delay: 0.1 },     // A6 (octave shimmer)
    ], 'sine', 0.15 * vol);
  },

  // Option B: Soft Gong - low resonant tone with shimmer
  winB: (ctx, vol) => {
    // Deep gong hit
    createOscillatorSound(ctx, 110, 1.0, 'sine', 0.4 * vol);  // A2
    createOscillatorSound(ctx, 220, 0.8, 'sine', 0.25 * vol); // A3 harmonic
    // Shimmer overtones
    playNoteSequence(ctx, [
      { freq: 440, duration: 0.4, delay: 0.05 },    // A4
      { freq: 660, duration: 0.3, delay: 0.1 },     // E5
      { freq: 880, duration: 0.2, delay: 0.15 },    // A5
    ], 'sine', 0.12 * vol);
  },

  // Option C: Rising Sparkle - quick ascending with shimmer
  winC: (ctx, vol) => {
    playNoteSequence(ctx, [
      { freq: 523, duration: 0.08, delay: 0 },      // C5
      { freq: 659, duration: 0.08, delay: 0.07 },   // E5
      { freq: 784, duration: 0.08, delay: 0.14 },   // G5
      { freq: 1047, duration: 0.08, delay: 0.21 },  // C6
      { freq: 1319, duration: 0.25, delay: 0.28 },  // E6 (hold)
    ], 'sine', 0.4 * vol);
    // Sparkle layer
    playNoteSequence(ctx, [
      { freq: 2093, duration: 0.1, delay: 0.35 },   // C7
      { freq: 2637, duration: 0.15, delay: 0.42 },  // E7
    ], 'sine', 0.15 * vol);
  },

  // Option D: Short Victory - punchy 3-note triumph
  winD: (ctx, vol) => {
    playNoteSequence(ctx, [
      { freq: 392, duration: 0.1, delay: 0 },       // G4
      { freq: 523, duration: 0.1, delay: 0.1 },     // C5
      { freq: 659, duration: 0.35, delay: 0.2 },    // E5 (hold)
    ], 'sine', 0.5 * vol);
    // Bass punch
    createOscillatorSound(ctx, 131, 0.2, 'sine', 0.3 * vol);  // C3
  },

  // Option E: Bell Tone - single rich bell with harmonics
  winE: (ctx, vol) => {
    // Fundamental
    createOscillatorSound(ctx, 440, 0.8, 'sine', 0.4 * vol);   // A4
    // Harmonics for richness
    createOscillatorSound(ctx, 880, 0.6, 'sine', 0.2 * vol);   // A5
    createOscillatorSound(ctx, 1320, 0.4, 'sine', 0.1 * vol);  // E6
    createOscillatorSound(ctx, 1760, 0.3, 'sine', 0.05 * vol); // A6
    // Slight detune for bell character
    createOscillatorSound(ctx, 445, 0.7, 'sine', 0.15 * vol);
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
    // Urgent triple-beep alert for calling opportunities (important alert!)
    playNoteSequence(ctx, [
      { freq: 1000, duration: 0.08, delay: 0 },      // First beep
      { freq: 1000, duration: 0.08, delay: 0.12 },   // Second beep
      { freq: 1200, duration: 0.12, delay: 0.24 },   // Third beep (higher)
      { freq: 800, duration: 0.06, delay: 0.38 },    // Low accent
      { freq: 1200, duration: 0.15, delay: 0.46 },   // Final high
    ], 'square', 0.45 * vol);
  },

  gameStart: (ctx, vol) => {
    // Start tone - session start event
    playNoteSequence(ctx, [
      { freq: 400, duration: 0.1, delay: 0 },
      { freq: 500, duration: 0.15, delay: 0.08 },
    ], 'sine', 0.35 * vol);
  },

  pass: (ctx, vol) => {
    // Subtle pass
    createOscillatorSound(ctx, 250, 0.05, 'sine', 0.15 * vol);
  },

  timerWarning: (ctx, vol) => {
    // Urgent warning beeps for low time - high priority alert!
    playNoteSequence(ctx, [
      { freq: 800, duration: 0.1, delay: 0 },       // First beep
      { freq: 800, duration: 0.1, delay: 0.15 },    // Second beep
      { freq: 1000, duration: 0.15, delay: 0.3 },   // Higher urgent beep
    ], 'square', 0.50 * vol);
  },

  drumroll: (ctx, vol) => {
    // Building suspense drumroll - rapid hits that build in intensity (climax)
    const hits: { freq: number; duration: number; delay: number }[] = [];
    // Start slow, get faster
    const totalDuration = 2.0;
    let time = 0;
    let interval = 0.15; // Start with slower hits
    while (time < totalDuration) {
      // Alternate between two low frequencies for drum effect
      const freq = time % 0.3 < 0.15 ? 100 : 120;
      hits.push({ freq, duration: 0.08, delay: time });
      time += interval;
      // Gradually speed up
      interval = Math.max(0.04, interval * 0.92);
    }
    playNoteSequence(ctx, hits, 'triangle', 1.0 * vol);
    // Add a rising tone underneath for tension
    playNoteSequence(ctx, [
      { freq: 150, duration: 0.5, delay: 0 },
      { freq: 180, duration: 0.5, delay: 0.5 },
      { freq: 220, duration: 0.5, delay: 1.0 },
      { freq: 280, duration: 0.6, delay: 1.5 },
    ], 'sine', 0.4 * vol);
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
        // Apply 0.10 multiplier to all sounds for softer baseline
        soundFn(ctx, volume * 0.10);
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
