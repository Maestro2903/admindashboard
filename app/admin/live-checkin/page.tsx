'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconMaximize, IconMinimize, IconVolume, IconVolumeOff } from '@tabler/icons-react';

type ScanResult = 'idle' | 'valid' | 'already_used' | 'invalid';

interface ScanResponse {
  result?: 'valid' | 'already_used' | 'invalid';
  message?: string;
  name?: string;
  passType?: string;
  teamName?: string;
  memberCount?: number;
}

const BEEP_VALID = 800;
const BEEP_ERROR = 200;
const BEEP_DURATION = 150;

function playBeep(freq: number) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = 0.2;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + BEEP_DURATION / 1000);
    osc.stop(ctx.currentTime + BEEP_DURATION / 1000);
  } catch { /* ignore */ }
}

export default function LiveCheckinPage() {
  const { user, loading: authLoading } = useAuth();
  const [result, setResult] = React.useState<ScanResult>('idle');
  const [scanData, setScanData] = React.useState<ScanResponse>({});
  const [loading, setLoading] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [scanTime, setScanTime] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Auto-reset after 3s
  React.useEffect(() => {
    if (result === 'idle') return;
    const t = setTimeout(() => {
      setResult('idle');
      setInput('');
      setScanData({});
      setScanTime(null);
      inputRef.current?.focus();
    }, 3000);
    return () => clearTimeout(t);
  }, [result]);

  // Sound feedback
  React.useEffect(() => {
    if (!soundEnabled) return;
    if (result === 'valid') playBeep(BEEP_VALID);
    if (result === 'already_used' || result === 'invalid') playBeep(BEEP_ERROR);
  }, [result, soundEnabled]);

  // Auto-focus
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const raw = input.trim();
      if (!raw || loading || !user) return;
      setLoading(true);
      setResult('idle');
      setScanData({});
      try {
        let body: unknown = raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') body = parsed;
        } catch { /* use as-is */ }
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/scan-verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as ScanResponse;
        setResult(data.result ?? 'invalid');
        setScanData(data);
        setScanTime(new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }));
      } catch {
        setResult('invalid');
        setScanData({ message: 'Request failed' });
      } finally {
        setLoading(false);
      }
    },
    [input, loading, user]
  );

  const toggleFullscreen = React.useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
      </div>
    );
  }

  const BG_CLASSES: Record<ScanResult, string> = {
    idle: 'bg-zinc-900',
    valid: 'bg-emerald-950',
    already_used: 'bg-amber-950',
    invalid: 'bg-red-950',
  };

  const BORDER_CLASSES: Record<ScanResult, string> = {
    idle: 'border-zinc-800',
    valid: 'border-emerald-500/50',
    already_used: 'border-amber-500/50',
    invalid: 'border-red-500/50',
  };

  const STATUS_LABELS: Record<ScanResult, string> = {
    idle: 'READY',
    valid: 'VALID',
    already_used: 'ALREADY USED',
    invalid: 'INVALID',
  };

  const STATUS_COLORS: Record<ScanResult, string> = {
    idle: 'text-zinc-500',
    valid: 'text-emerald-400',
    already_used: 'text-amber-400',
    invalid: 'text-red-400',
  };

  return (
    <div ref={containerRef} className={`space-y-4 ${isFullscreen ? 'p-6 bg-[#09090b] min-h-screen' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Live Check-In</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Scan or paste QR payload. Auto-resets in 3s.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            {soundEnabled ? <IconVolume size={18} /> : <IconVolumeOff size={18} />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            {isFullscreen ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
          </Button>
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Paste QR payload..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-zinc-900 border-zinc-800 text-white text-lg h-12 placeholder:text-zinc-600 focus-visible:ring-zinc-700"
            autoFocus
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={!input.trim() || loading}
            className="h-12 px-6 bg-white text-zinc-900 hover:bg-zinc-200 font-medium"
          >
            {loading ? 'Checking...' : 'Verify'}
          </Button>
        </div>
      </form>

      {/* Result Card */}
      <div
        className={`mx-auto max-w-2xl rounded-2xl border-2 ${BORDER_CLASSES[result]} ${BG_CLASSES[result]} transition-all duration-300 ease-out`}
      >
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center min-h-[300px]">
          <div className={`text-5xl font-bold tracking-tight ${STATUS_COLORS[result]} transition-colors duration-300`}>
            {STATUS_LABELS[result]}
          </div>

          {result !== 'idle' && (
            <div className="mt-6 space-y-2 fade-in">
              {scanData.name && (
                <p className="text-2xl font-medium text-white">{scanData.name}</p>
              )}
              {scanData.passType && (
                <p className="text-sm text-zinc-400 uppercase tracking-wider">{scanData.passType}</p>
              )}
              {scanData.teamName && (
                <p className="text-sm text-zinc-400">Team: {scanData.teamName}</p>
              )}
              {scanData.memberCount && (
                <p className="text-sm text-zinc-500">{scanData.memberCount} members</p>
              )}
              {scanData.message && result !== 'valid' && (
                <p className="text-sm text-zinc-500 mt-2">{scanData.message}</p>
              )}
              {scanTime && (
                <p className="text-xs text-zinc-600 tabular-nums mt-3">{scanTime}</p>
              )}
            </div>
          )}

          {result === 'idle' && (
            <p className="mt-4 text-sm text-zinc-600">Waiting for scan input...</p>
          )}
        </div>
      </div>

      {/* Device Info */}
      <div className="text-center">
        <span className="text-[11px] text-zinc-600 tabular-nums">
          Device: {typeof navigator !== 'undefined' ? navigator.userAgent.split(' ').pop()?.split('/')[0] ?? 'Unknown' : 'Unknown'}
        </span>
      </div>
    </div>
  );
}
