'use client';

import * as React from 'react';

function stringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function DiffViewer({
  previousData,
  newData,
  className,
}: {
  previousData: Record<string, unknown>;
  newData: Record<string, unknown>;
  className?: string;
}) {
  const allKeys = React.useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(previousData),
      ...Object.keys(newData),
    ]);
    return Array.from(set).sort();
  }, [previousData, newData]);

  return (
    <div
      className={`grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm ${className ?? ''}`}
    >
      <div className="rounded border border-slate-200 bg-slate-50 p-2">
        <div className="mb-1 font-medium text-slate-500">Previous</div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-slate-700">
          {allKeys.map((key) => {
            const prev = previousData[key];
            const next = newData[key];
            const removed = !(key in newData);
            const changed = key in newData && JSON.stringify(prev) !== JSON.stringify(next);
            return (
              <div
                key={key}
                className={
                  removed
                    ? 'bg-red-100 text-red-800'
                    : changed
                      ? 'bg-amber-100 text-amber-800'
                      : ''
                }
              >
                <span className="text-slate-500">{key}:</span> {stringify(prev)}
              </div>
            );
          })}
        </pre>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 p-2">
        <div className="mb-1 font-medium text-slate-500">New</div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-slate-700">
          {allKeys.map((key) => {
            const prev = previousData[key];
            const next = newData[key];
            const added = !(key in previousData);
            const changed = key in previousData && JSON.stringify(prev) !== JSON.stringify(next);
            return (
              <div
                key={key}
                className={
                  added
                    ? 'bg-green-100 text-green-800'
                    : changed
                      ? 'bg-amber-100 text-amber-800'
                      : ''
                }
              >
                <span className="text-slate-500">{key}:</span> {stringify(next)}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
