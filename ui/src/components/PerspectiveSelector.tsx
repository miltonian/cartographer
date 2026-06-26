import type { PerspectiveSummary } from '../lib/api';

interface Props {
  perspectives: PerspectiveSummary[];
  activePerspective: string;
  onSwitch: (perspectiveId: string) => void;
}

export function PerspectiveSelector({ perspectives, activePerspective, onSwitch }: Props) {
  // Hide boundary-derived perspectives — those are accessed via semantic zoom.
  // Show everything else: default, agent-created, and legacy (no source field).
  const visible = perspectives.filter((p) => p.source !== 'boundary');
  if (visible.length <= 1) return null;

  // When the active perspective is a hidden (boundary-derived) one — i.e. you've
  // zoomed into a boundary — highlight Overview rather than leaving no tab active.
  const visibleIds = new Set(visible.map((p) => p.id));
  const effectiveActive = visibleIds.has(activePerspective) ? activePerspective : 'perspective:default';

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#111113e6',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 3,
        zIndex: 10,
      }}
    >
      {visible.map((p) => {
        const isActive = p.id === effectiveActive;
        return (
          <button
            key={p.id}
            onClick={() => onSwitch(p.id)}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#fafafa' : 'var(--text-dim)',
              background: isActive ? '#27272a' : 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {p.name}
            {!p.isDefault && (
              <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.5 }}>
                {p.entityCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
