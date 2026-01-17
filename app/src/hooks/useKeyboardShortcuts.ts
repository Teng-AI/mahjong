'use client';

import { useCallback, useState } from 'react';

export interface KeyboardShortcuts {
  chow: string;
  pung: string;
  kong: string;
  win: string;
}

// Note: Draw and Pass are hardcoded to Space (not customizable)
const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  win: 'H',
  kong: 'G',
  pung: 'P',
  chow: 'C',
};

const STORAGE_KEY = 'mahjong-keyboard-shortcuts';

export interface UseKeyboardShortcutsReturn {
  shortcuts: KeyboardShortcuts;
  setShortcut: (action: keyof KeyboardShortcuts, key: string) => void;
  resetToDefaults: () => void;
}

export function useKeyboardShortcuts(): UseKeyboardShortcutsReturn {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcuts>(() => {
    if (typeof window === 'undefined') return DEFAULT_SHORTCUTS;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SHORTCUTS;

    try {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new keys added in updates
      return {
        ...DEFAULT_SHORTCUTS,
        ...Object.fromEntries(
          Object.entries(parsed).filter(([, v]) => typeof v === 'string')
        ),
      };
    } catch {
      return DEFAULT_SHORTCUTS;
    }
  });

  const setShortcut = useCallback((action: keyof KeyboardShortcuts, key: string) => {
    setShortcuts(prev => {
      const updated = { ...prev, [action]: key.toUpperCase() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SHORTCUTS));
  }, []);

  return {
    shortcuts,
    setShortcut,
    resetToDefaults,
  };
}
