'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcuts;
  setShortcut: (action: keyof KeyboardShortcuts, key: string) => void;
  resetToDefaults: () => void;
  // Sound controls
  soundEnabled: boolean;
  toggleSound: () => void;
  volume: number;
  setVolume: (volume: number) => void;
  // Timer settings (host only)
  isHost?: boolean;
  callingTimerSeconds?: number | null;
  setCallingTimerSeconds?: (seconds: number | null) => Promise<void>;
  turnTimerSeconds?: number | null;
  setTurnTimerSeconds?: (seconds: number | null) => Promise<void>;
}

// Check if device has touch capabilities (likely mobile)
function useIsTouchDevice() {
  const [isTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });

  return isTouch;
}

const ACTION_LABELS: Record<keyof KeyboardShortcuts, string> = {
  win: 'Hu (胡)',
  kong: 'Gang (杠)',
  pung: 'Peng (碰)',
  chow: 'Chi (吃)',
};

const ACTION_ORDER: (keyof KeyboardShortcuts)[] = ['win', 'kong', 'pung', 'chow'];

export function SettingsModal({
  isOpen,
  onClose,
  shortcuts,
  setShortcut,
  resetToDefaults,
  soundEnabled,
  toggleSound,
  volume,
  setVolume,
  isHost,
  callingTimerSeconds,
  setCallingTimerSeconds,
  turnTimerSeconds,
  setTurnTimerSeconds,
}: SettingsModalProps) {
  const [recordingFor, setRecordingFor] = useState<keyof KeyboardShortcuts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isTouchDevice = useIsTouchDevice();

  // Calling timer input state (local until blur)
  const [timerInputValue, setTimerInputValue] = useState<string>(
    callingTimerSeconds !== null && callingTimerSeconds !== undefined
      ? String(callingTimerSeconds)
      : ''
  );
  const [timerEnabled, setTimerEnabled] = useState(
    callingTimerSeconds !== null && callingTimerSeconds !== undefined
  );

  // Turn timer input state (local until blur)
  const [turnTimerInputValue, setTurnTimerInputValue] = useState<string>(
    turnTimerSeconds !== null && turnTimerSeconds !== undefined
      ? String(turnTimerSeconds)
      : ''
  );
  const [turnTimerEnabled, setTurnTimerEnabled] = useState(
    turnTimerSeconds !== null && turnTimerSeconds !== undefined
  );

  // Sync local calling timer state when prop changes
  useEffect(() => {
    const hasTimer = callingTimerSeconds !== null && callingTimerSeconds !== undefined;
    setTimerEnabled(hasTimer);
    setTimerInputValue(hasTimer ? String(callingTimerSeconds) : '30');
  }, [callingTimerSeconds]);

  // Sync local turn timer state when prop changes
  useEffect(() => {
    const hasTimer = turnTimerSeconds !== null && turnTimerSeconds !== undefined;
    setTurnTimerEnabled(hasTimer);
    setTurnTimerInputValue(hasTimer ? String(turnTimerSeconds) : '30');
  }, [turnTimerSeconds]);

  // Handle timer toggle
  const handleTimerToggle = async () => {
    if (!setCallingTimerSeconds) return;
    if (timerEnabled) {
      await setCallingTimerSeconds(null);
      setTimerEnabled(false);
    } else {
      const defaultSeconds = 30;
      await setCallingTimerSeconds(defaultSeconds);
      setTimerEnabled(true);
      setTimerInputValue(String(defaultSeconds));
    }
  };

  // Handle timer slider change
  const handleTimerSliderChange = async (value: number) => {
    if (!setCallingTimerSeconds) return;
    setTimerInputValue(String(value));
    await setCallingTimerSeconds(value);
  };

  // Handle timer input blur (validate and save)
  const handleTimerInputBlur = async () => {
    if (!setCallingTimerSeconds) return;
    const parsed = parseInt(timerInputValue, 10);
    if (isNaN(parsed) || parsed < 10) {
      setTimerInputValue('10');
      await setCallingTimerSeconds(10);
    } else if (parsed > 120) {
      setTimerInputValue('120');
      await setCallingTimerSeconds(120);
    } else {
      setTimerInputValue(String(parsed));
      await setCallingTimerSeconds(parsed);
    }
  };

  // Handle turn timer toggle
  const handleTurnTimerToggle = async () => {
    if (!setTurnTimerSeconds) return;
    if (turnTimerEnabled) {
      await setTurnTimerSeconds(null);
      setTurnTimerEnabled(false);
    } else {
      const defaultSeconds = 30;
      await setTurnTimerSeconds(defaultSeconds);
      setTurnTimerEnabled(true);
      setTurnTimerInputValue(String(defaultSeconds));
    }
  };

  // Handle turn timer slider change
  const handleTurnTimerSliderChange = async (value: number) => {
    if (!setTurnTimerSeconds) return;
    setTurnTimerInputValue(String(value));
    await setTurnTimerSeconds(value);
  };

  // Handle turn timer input blur (validate and save)
  const handleTurnTimerInputBlur = async () => {
    if (!setTurnTimerSeconds) return;
    const parsed = parseInt(turnTimerInputValue, 10);
    if (isNaN(parsed) || parsed < 10) {
      setTurnTimerInputValue('10');
      await setTurnTimerSeconds(10);
    } else if (parsed > 300) {
      setTurnTimerInputValue('300');
      await setTurnTimerSeconds(300);
    } else {
      setTurnTimerInputValue(String(parsed));
      await setTurnTimerSeconds(parsed);
    }
  };

  // Handle key capture when recording
  const handleKeyCapture = useCallback((e: KeyboardEvent) => {
    if (!recordingFor) return;
    e.preventDefault();
    e.stopPropagation();

    const key = e.key.toUpperCase();

    // Cancel on Escape
    if (key === 'ESCAPE') {
      setRecordingFor(null);
      setError(null);
      return;
    }

    // Ignore modifier keys alone
    if (['SHIFT', 'CONTROL', 'ALT', 'META'].includes(key)) {
      return;
    }

    // Check for duplicates
    const isDuplicate = Object.entries(shortcuts)
      .some(([action, k]) => action !== recordingFor && k === key);

    if (isDuplicate) {
      setError(`"${key}" is already used for another action`);
      return;
    }

    setShortcut(recordingFor, key);
    setRecordingFor(null);
    setError(null);
  }, [recordingFor, shortcuts, setShortcut]);

  // Add/remove keyboard listener when recording
  useEffect(() => {
    if (!recordingFor) return;

    window.addEventListener('keydown', handleKeyCapture);
    return () => window.removeEventListener('keydown', handleKeyCapture);
  }, [recordingFor, handleKeyCapture]);

  // Close modal on Escape when not recording
  useEffect(() => {
    if (!isOpen || recordingFor) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, recordingFor, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !recordingFor) {
          onClose();
        }
      }}
    >
      <div className="bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4 border-2 border-slate-600 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
            disabled={!!recordingFor}
          >
            &times;
          </button>
        </div>

        {/* Sound Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
            Sound
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Sound Effects</span>
              <button
                onClick={toggleSound}
                className={`w-12 h-7 rounded-full transition-colors ${
                  soundEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {soundEnabled && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Volume</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-sm">🔈</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-24 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <span className="text-slate-500 text-sm">🔊</span>
                  <span className="text-slate-400 text-sm w-8">{Math.round(volume * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Timer Settings Section - Host only */}
        {isHost && setCallingTimerSeconds && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
              Calling Timer
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Enable Timer</span>
                <button
                  onClick={handleTimerToggle}
                  className={`w-12 h-7 rounded-full transition-colors ${
                    timerEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      timerEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {timerEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Duration</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="10"
                        max="120"
                        step="5"
                        value={parseInt(timerInputValue) || 30}
                        onChange={(e) => handleTimerSliderChange(parseInt(e.target.value))}
                        className="w-24 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <input
                        type="number"
                        min="10"
                        max="120"
                        value={timerInputValue}
                        onChange={(e) => setTimerInputValue(e.target.value)}
                        onBlur={handleTimerInputBlur}
                        className="w-16 px-2 py-1 text-sm text-center bg-slate-700 border border-slate-600 rounded text-white"
                      />
                      <span className="text-slate-400 text-sm">sec</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Players who don&apos;t respond within the timer will auto-pass.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Turn Timer Settings Section - Host only */}
        {isHost && setTurnTimerSeconds && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
              Turn Timer
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Enable Timer</span>
                <button
                  onClick={handleTurnTimerToggle}
                  className={`w-12 h-7 rounded-full transition-colors ${
                    turnTimerEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      turnTimerEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {turnTimerEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Duration</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="10"
                        max="300"
                        step="10"
                        value={parseInt(turnTimerInputValue) || 30}
                        onChange={(e) => handleTurnTimerSliderChange(parseInt(e.target.value))}
                        className="w-24 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <input
                        type="number"
                        min="10"
                        max="300"
                        value={turnTimerInputValue}
                        onChange={(e) => setTurnTimerInputValue(e.target.value)}
                        onBlur={handleTurnTimerInputBlur}
                        className="w-16 px-2 py-1 text-sm text-center bg-slate-700 border border-slate-600 rounded text-white"
                      />
                      <span className="text-slate-400 text-sm">sec</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Players who don&apos;t act within the timer will auto-play (draw &amp; discard).
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Section - Hidden on touch devices */}
        {!isTouchDevice && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
              Keyboard Shortcuts
            </h3>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 text-sm px-3 py-2 rounded mb-3">
                {error}
              </div>
            )}

            <div className="space-y-2">
              {ACTION_ORDER.map((action) => (
                <div key={action} className="flex items-center justify-between">
                  <span className="text-slate-300">{ACTION_LABELS[action]}</span>
                  <button
                    onClick={() => {
                      setRecordingFor(action);
                      setError(null);
                    }}
                    className={`w-16 h-9 rounded font-mono text-center transition-colors ${
                      recordingFor === action
                        ? 'bg-emerald-500 text-white animate-pulse'
                        : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                  >
                    {recordingFor === action ? '...' : shortcuts[action]}
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 mt-3">
              Click a key to change it. Press Escape to cancel.<br />
              <span className="text-emerald-400">Tip: Space = Draw (your turn) or Pass (calling)</span>
            </p>

            {/* Reset Button */}
            <button
              onClick={() => {
                resetToDefaults();
                setError(null);
              }}
              className="w-full py-2 mt-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              disabled={!!recordingFor}
            >
              Reset to Defaults
            </button>

            {/* Fixed shortcuts for tile selection */}
            <div className="mt-6 pt-4 border-t border-slate-700">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Your Turn
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Draw tile</span>
                  <span className="font-mono text-slate-300">Space</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Navigate tiles</span>
                  <span className="font-mono text-slate-300">← →</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Discard selected</span>
                  <span className="font-mono text-slate-300">Enter</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Cancel selection</span>
                  <span className="font-mono text-slate-300">Esc</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Quick select (1st-10th)</span>
                  <span className="font-mono text-slate-300">1-9, 0</span>
                </div>
              </div>
            </div>

            {/* Calling phase shortcuts */}
            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Calling Phase
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Pass</span>
                  <span className="font-mono text-slate-300">Space</span>
                </div>
              </div>
            </div>

            {/* Chi selection shortcuts */}
            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Chi Selection
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Navigate valid tiles</span>
                  <span className="font-mono text-slate-300">← →</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Select tile</span>
                  <span className="font-mono text-slate-300">Space</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Confirm chi</span>
                  <span className="font-mono text-slate-300">Enter</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Cancel chi</span>
                  <span className="font-mono text-slate-300">Esc</span>
                </div>
              </div>
            </div>

            {/* Gang selection shortcuts */}
            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Gang Selection (Multiple Options)
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Navigate options</span>
                  <span className="font-mono text-slate-300">← →</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Confirm gang</span>
                  <span className="font-mono text-slate-300">Space / Enter</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Cancel</span>
                  <span className="font-mono text-slate-300">Esc</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Touch device notice */}
        {isTouchDevice && (
          <div className="text-center text-slate-400 py-4">
            <p className="text-sm">Keyboard shortcuts are not available on touch devices.</p>
            <p className="text-xs mt-2 text-slate-500">Use the on-screen buttons to play.</p>
          </div>
        )}
      </div>
    </div>
  );
}
