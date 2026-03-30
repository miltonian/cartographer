import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const KIND_SHORT: Record<string, string> = {
  boundary: 'BND',
  capability: 'CAP',
  actor: 'ACT',
  entity: 'ENT',
  transition: 'TRN',
  dependency: 'DEP',
  'side-effect': 'FX',
  'async-process': 'ASY',
  invariant: 'INV',
  'failure-point': 'FAIL',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  proven: '#22c55e',
  high: '#84cc16',
  medium: '#eab308',
  low: '#f97316',
  speculative: '#ef4444',
};

interface SemanticNodeData {
  label: string;
  kind: string;
  description?: string;
  confidence: string;
  evidenceCount: number;
  color: string;
  selected: boolean;
  dimmed?: boolean;
  onFlow?: boolean;
  flowStep?: number;
  changeType?: string;
  contextual?: boolean;
}

const CHANGE_TYPE_COLORS: Record<string, string> = {
  added: '#22c55e',
  modified: '#f59e0b',
  removed: '#ef4444',
  affected: '#64748b',
};

export const SemanticNode = memo(function SemanticNode({
  data,
}: NodeProps & { data: SemanticNodeData }) {
  const { label, kind, confidence, color, selected, dimmed, onFlow, flowStep, changeType, contextual } = data;
  const confColor = CONFIDENCE_COLORS[confidence] ?? '#3f3f46';
  const shortKind = KIND_SHORT[kind] ?? kind.slice(0, 3).toUpperCase();
  const isActor = kind === 'actor';
  const ghostOpacity = contextual ? 0.3 : 1;
  const changeColor = changeType ? CHANGE_TYPE_COLORS[changeType] ?? color : null;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div
        style={{
          background: selected ? `${color}12` : onFlow ? `${color}0a` : '#111113',
          borderRadius: 6,
          padding: '6px 10px 6px 0',
          minWidth: 72,
          maxWidth: 180,
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          opacity: dimmed ? 0.25 : ghostOpacity,
          boxShadow: selected
            ? `0 0 0 1px ${color}60, 0 0 12px ${color}20`
            : changeColor
              ? `0 0 0 1.5px ${changeColor}80`
              : onFlow
                ? `0 0 0 1px ${color}40`
                : '0 0 0 1px #1e1e21',
          textDecoration: changeType === 'removed' ? 'line-through' : undefined,
        }}
      >
        {/* Left color stripe — uses change color for PR changesets */}
        <div
          style={{
            width: changeColor ? 4 : isActor ? 5 : 3,
            alignSelf: 'stretch',
            background: changeColor ?? color,
            borderRadius: '6px 0 0 6px',
            marginRight: 8,
            opacity: selected || onFlow ? 1 : 0.7,
            flexShrink: 0,
          }}
        />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: selected || onFlow ? '#fafafa' : '#d4d4d8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}
          >
            {label}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 2,
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: `${color}99`,
                fontWeight: 600,
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}
            >
              {shortKind}
            </span>
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
          </div>
        </div>

        {/* Badge — change type for PRs, step number for flows */}
        {(flowStep !== undefined || changeType) && (
          <div
            style={{
              height: 18,
              minWidth: 18,
              borderRadius: changeType ? 4 : '50%',
              padding: changeType ? '0 5px' : 0,
              background: changeColor ? `${changeColor}20` : `${color}30`,
              border: `1px solid ${changeColor ? `${changeColor}60` : `${color}60`}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: changeType ? 8 : 9,
              fontWeight: 700,
              color: changeColor ?? color,
              flexShrink: 0,
              marginLeft: 4,
              marginRight: 2,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {changeType ?? flowStep}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </>
  );
});
