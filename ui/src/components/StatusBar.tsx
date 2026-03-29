import type { ModelSummary } from '../lib/api';

interface Props {
  connected: boolean;
  summary: ModelSummary | null;
}

export function StatusBar({ connected, summary }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#111113e6',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '5px 12px',
        fontSize: 11,
        zIndex: 10,
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            display: 'inline-block',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: connected ? '#22c55e' : '#ef4444',
            opacity: 0.8,
          }}
        />
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>
          {connected ? 'live' : 'offline'}
        </span>
      </div>

      {summary && summary.entityCount > 0 && (
        <>
          <span style={{ color: '#27272a' }}>/</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>
            {summary.entityCount}e {summary.relationshipCount}r
          </span>
        </>
      )}
    </div>
  );
}
