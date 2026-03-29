import type { EntityDetails, Evidence, WorldRelationship, BehaviorSlice } from '../lib/api';

// ─── Colors ────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  boundary: '#818cf8',
  capability: '#a78bfa',
  actor: '#60a5fa',
  entity: '#22d3ee',
  transition: '#fbbf24',
  dependency: '#94a3b8',
  'side-effect': '#f87171',
  'async-process': '#fb923c',
  invariant: '#34d399',
  'failure-point': '#f87171',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  proven: '#22c55e',
  high: '#84cc16',
  medium: '#eab308',
  low: '#f97316',
  speculative: '#ef4444',
};

// ─── Inspector Panel ───────────────────────────────────────────

interface Props {
  details: EntityDetails;
  slices: BehaviorSlice[];
  onClose: () => void;
}

export function Inspector({ details, slices, onClose }: Props) {
  const { entity, incoming, outgoing } = details;
  const color = KIND_COLORS[entity.kind] ?? '#71717a';

  return (
    <div
      style={{
        width: 380,
        height: '100%',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Kind + Name */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  color,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {entity.kind}
              </span>
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              {entity.name}
            </div>
            {entity.description && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginTop: 8,
                  lineHeight: 1.6,
                }}
              >
                {entity.description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: 14,
              padding: '2px 6px',
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            esc
          </button>
        </div>
      </div>

      {/* Evidence */}
      <Section title="Evidence" count={entity.evidence.length}>
        {entity.evidence.map((ev) => (
          <EvidenceCard key={ev.id} evidence={ev} />
        ))}
      </Section>

      {/* Incoming Relationships */}
      {incoming.length > 0 && (
        <Section title="Incoming" count={incoming.length}>
          {incoming.map((rel) => (
            <RelationshipRow key={rel.id} rel={rel} direction="from" />
          ))}
        </Section>
      )}

      {/* Outgoing Relationships */}
      {outgoing.length > 0 && (
        <Section title="Outgoing" count={outgoing.length}>
          {outgoing.map((rel) => (
            <RelationshipRow key={rel.id} rel={rel} direction="to" />
          ))}
        </Section>
      )}

      {/* Flows passing through this entity */}
      {(() => {
        const passingFlows = slices.filter((s) =>
          s.steps.some((step) => step.entityId === entity.id),
        );
        if (passingFlows.length === 0) return null;
        return (
          <Section title="Flows" count={passingFlows.length}>
            {passingFlows.map((slice) => {
              const stepIdx = slice.steps.findIndex((s) => s.entityId === entity.id);
              const step = slice.steps[stepIdx];
              return (
                <div
                  key={slice.id}
                  style={{
                    padding: '6px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>
                    {slice.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    Step {stepIdx + 1} of {slice.steps.length}
                    {step?.label && ` \u2014 ${step.label}`}
                  </div>
                </div>
              );
            })}
          </Section>
        );
      })()}

      {/* ID */}
      <div
        style={{
          padding: '12px 20px',
          fontSize: 10,
          color: 'var(--text-dim)',
          fontFamily: '"JetBrains Mono", monospace',
          borderTop: '1px solid var(--border)',
          marginTop: 'auto',
        }}
      >
        {entity.id}
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        style={{
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.6 }}>
          {count}
        </span>
      </div>
      <div style={{ padding: '0 20px 12px' }}>{children}</div>
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const confColor = CONFIDENCE_COLORS[evidence.confidence] ?? '#71717a';

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 6,
        fontSize: 12,
      }}
    >
      {/* Confidence line */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: evidence.reasoning || evidence.anchors.length > 0 ? 8 : 0,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: confColor,
          }}
        />
        <span
          style={{
            fontSize: 10,
            color: confColor,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {evidence.confidence}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{evidence.provenance}</span>
      </div>

      {/* Reasoning */}
      {evidence.reasoning && (
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: 11,
            marginBottom: 8,
            lineHeight: 1.6,
          }}
        >
          {evidence.reasoning}
        </div>
      )}

      {/* Source anchors */}
      {evidence.anchors.map((anchor, i) => (
        <div
          key={i}
          style={{
            background: '#0a0a0b',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: '6px 8px',
            marginBottom: i < evidence.anchors.length - 1 ? 4 : 0,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              color: 'var(--text-dim)',
              marginBottom: 3,
              fontSize: 10,
            }}
          >
            {anchor.filePath}:{anchor.lineStart}
            {anchor.lineEnd !== anchor.lineStart && `\u2013${anchor.lineEnd}`}
          </div>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: '#a1a1aa',
            }}
          >
            {anchor.snippet}
          </pre>
        </div>
      ))}
    </div>
  );
}

function RelationshipRow({
  rel,
  direction,
}: {
  rel: WorldRelationship;
  direction: 'from' | 'to';
}) {
  const otherEntity = direction === 'from' ? rel.source : rel.target;
  const bestConf =
    rel.evidence.length > 0 ? rel.evidence[0].confidence : 'speculative';
  const confColor = CONFIDENCE_COLORS[bestConf] ?? '#71717a';
  // Extract just the name part from entity ID (e.g. "capability:foo" → "foo")
  const displayName = otherEntity.includes(':')
    ? otherEntity.split(':').slice(1).join(':')
    : otherEntity;
  const displayKind = otherEntity.includes(':')
    ? otherEntity.split(':')[0]
    : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 0',
        fontSize: 12,
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: confColor,
          opacity: 0.6,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: 'var(--text-dim)',
          fontSize: 10,
          fontFamily: '"JetBrains Mono", monospace',
          minWidth: 56,
          flexShrink: 0,
        }}
      >
        {rel.kind}
      </span>
      <span
        style={{
          color: 'var(--text-dim)',
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        {direction === 'from' ? '\u2190' : '\u2192'}
      </span>
      <span
        style={{
          color: 'var(--text)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 12,
        }}
      >
        {displayName}
      </span>
      {displayKind && (
        <span
          style={{
            color: 'var(--text-dim)',
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flexShrink: 0,
            marginLeft: 'auto',
          }}
        >
          {displayKind}
        </span>
      )}
    </div>
  );
}
