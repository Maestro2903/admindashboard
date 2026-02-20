'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type ScanResult = 'idle' | 'valid' | 'already_used' | 'invalid';

const BEEP_VALID = 800;
const BEEP_ERROR = 200;
const BEEP_DURATION = 150;

function playBeep(freq: number) {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.frequency.value = freq;
    oscillator.type = 'sine';
    gain.gain.value = 0.2;
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + BEEP_DURATION / 1000);
    oscillator.stop(audioContext.currentTime + BEEP_DURATION / 1000);
  } catch {
    // ignore
  }
}

export function LiveScanPanel({
  result,
  message,
  name,
  onSubmit,
  loading,
}: {
  result: ScanResult;
  message?: string;
  name?: string;
  onSubmit: (payload: string) => void;
  loading: boolean;
}) {
  const [input, setInput] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (result === 'valid') playBeep(BEEP_VALID);
    if (result === 'already_used' || result === 'invalid') playBeep(BEEP_ERROR);
  }, [result]);

  const onReset = React.useCallback(() => {
    setInput('');
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (result !== 'idle') {
      const t = setTimeout(() => {
        onReset();
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [result, onReset]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = input.trim();
    if (!raw || loading) return;
    onSubmit(raw);
  };

  const bgClass =
    result === 'valid'
      ? 'bg-green-900/80'
      : result === 'already_used'
        ? 'bg-red-900/80'
        : result === 'invalid'
          ? 'bg-yellow-900/80'
          : 'bg-slate-100';

  const textClass =
    result === 'valid'
      ? 'text-green-100'
      : result === 'already_used'
        ? 'text-red-100'
        : result === 'invalid'
          ? 'text-yellow-100'
          : 'text-slate-600';

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <form onSubmit={handleSubmit} className="p-4 border-b border-slate-200 bg-white">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Paste scan result or QR payload…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 border-slate-200 bg-white text-slate-900 text-base placeholder:text-slate-400"
            autoFocus
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-slate-700 hover:bg-slate-600 text-white shrink-0"
          >
            {loading ? 'Checking…' : 'Verify'}
          </Button>
        </div>
      </form>

      <div
        className={`flex-1 flex flex-col items-center justify-center p-8 transition-colors duration-300 ${bgClass}`}
      >
        {result === 'idle' && (
          <p className="text-xl text-slate-500">Scan or paste QR payload to verify</p>
        )}
        {result === 'valid' && (
          <>
            <p className="text-4xl font-bold text-green-100 mb-2">VALID</p>
            <p className="text-2xl text-green-200">{name ?? 'Checked in'}</p>
            <p className="text-sm text-green-300/80 mt-2">{message}</p>
          </>
        )}
        {result === 'already_used' && (
          <>
            <p className="text-4xl font-bold text-red-100 mb-2">ALREADY USED</p>
            <p className="text-lg text-red-200">{message ?? 'This pass was already used.'}</p>
          </>
        )}
        {result === 'invalid' && (
          <>
            <p className="text-4xl font-bold text-yellow-100 mb-2">INVALID</p>
            <p className="text-lg text-yellow-200">{message ?? 'Invalid or expired token.'}</p>
          </>
        )}
      </div>
    </div>
  );
}
