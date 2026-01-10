'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcuts;
  setShortcut: (action: keyof KeyboardShortcuts, key: string) => void;
  resetToDefaults: () => void;
  // Host timer settings
  isHost?: boolean;
  callTimer?: number;
  onCallTimerChange?: (seconds: number) => void;
}

const ACTION_LABELS: Record<keyof KeyboardShortcuts, string> = {
  draw: 'Draw',
  win: 'Win',
  kong: 'Kong',
  pung: 'Pung',
  chow: 'Chow',
  pass: 'Pass',
};

const ACTION_ORDER: (keyof KeyboardShortcuts)[] = ['draw', 'win', 'kong', 'pung', 'chow', 'pass'];

export function SettingsModal({
  isOpen,
  onClose,
  shortcuts,
  setShortcut,
  resetToDefaults,
  isHost,
  callTimer,
  onCallTimerChange,
}: SettingsModalProps) {
  const [recordingFor, setRecordingFor] = useState<keyof KeyboardShortcuts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timerInput, setTimerInput] = useState<string>(String(callTimer ?? 30));

  // Sync timerInput when callTimer prop changes
  useEffect(() => {
    setTimerInput(String(callTimer ?? 30));
  }, [callTimer]);

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
      <div className="bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4 border-2 border-slate-600">
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

        {/* Keyboard Shortcuts Section */}
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
            Click a key to change it. Press Escape to cancel.
          </p>
        </div>

        {/* Host Timer Settings */}
        {isHost && onCallTimerChange && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
              Call Timer (Host Only)
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={15}
                max={120}
                value={callTimer ?? 30}
                onChange={(e) => onCallTimerChange(parseInt(e.target.value))}
                className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={15}
                  max={120}
                  value={timerInput}
                  onChange={(e) => setTimerInput(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(timerInput) || 30;
                    const clamped = Math.min(120, Math.max(15, val));
                    setTimerInput(String(clamped));
                    onCallTimerChange(clamped);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-14 bg-slate-700 text-white text-center px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-slate-400 text-sm">sec</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Players auto-pass when timer expires. (15-120 sec)
            </p>
          </div>
        )}

        {/* Reset Button */}
        <button
          onClick={() => {
            resetToDefaults();
            setError(null);
          }}
          className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
          disabled={!!recordingFor}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
