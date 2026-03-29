import type { BehaviorSlice } from '../lib/api';

interface Props {
  slices: BehaviorSlice[];
  activeSliceId: string | null;
  onSelectSlice: (id: string | null) => void;
}

export function FlowPanel({ slices, activeSliceId, onSelectSlice }: Props) {
  if (slices.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 240,
        maxHeight: 'calc(100vh - 24px)',
        overflow: 'auto',
        background: '#111113e6',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        zIndex: 10,
        fontSize: 12,
      }}
    >
      <div
        style={{
          padding: '10px 14px 8px',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          borderBottom: '1px solid var(--border)',
        }}
      >
        Flows
      </div>

      {slices.map((slice) => {
        const isActive = slice.id === activeSliceId;
        return (
          <button
            key={slice.id}
            onClick={() => onSelectSlice(isActive ? null : slice.id)}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 14px',
              background: isActive ? '#818cf815' : 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
              color: 'var(--text)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: isActive ? '#818cf8' : 'var(--text)',
                marginBottom: 3,
              }}
            >
              {slice.name}
            </div>
            {slice.description && (
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  lineHeight: 1.5,
                  marginBottom: 4,
                }}
              >
                {slice.description}
              </div>
            )}
            {/* Step previews */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {slice.steps.map((step, i) => {
                const name = step.entityId.includes(':')
                  ? step.entityId.split(':').slice(1).join(':')
                  : step.entityId;
                return (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {i > 0 && (
                      <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>→</span>
                    )}
                    <span
                      style={{
                        fontSize: 9,
                        color: isActive ? '#818cf8cc' : 'var(--text-dim)',
                        fontFamily: '"JetBrains Mono", monospace',
                      }}
                    >
                      {name}
                    </span>
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
