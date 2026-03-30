export interface BreadcrumbSegment {
  id: string | null; // null = overview (default perspective)
  name: string;
}

interface Props {
  path: BreadcrumbSegment[];
  onNavigate: (perspectiveId: string | null) => void;
}

export function Breadcrumb({ path, onNavigate }: Props) {
  if (path.length <= 1) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 44,
        left: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        background: '#111113e6',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '4px 6px',
        zIndex: 10,
        fontSize: 11,
      }}
    >
      {path.map((segment, i) => {
        const isLast = i === path.length - 1;
        return (
          <span key={segment.id ?? 'root'} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <span style={{ color: 'var(--text-dim)', margin: '0 4px', fontSize: 9 }}>
                ›
              </span>
            )}
            {isLast ? (
              <span style={{ color: 'var(--text)', fontWeight: 500, padding: '2px 6px' }}>
                {segment.name}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(segment.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; }}
              >
                {segment.name}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
