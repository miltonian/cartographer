import { memo, useState } from 'react';
import { type NodeProps } from '@xyflow/react';

interface BoundaryNodeData {
  label: string;
  color: string;
  width: number;
  height: number;
  selected: boolean;
}

export const BoundaryNode = memo(function BoundaryNode({
  data,
}: NodeProps & { data: BoundaryNodeData }) {
  const { label, color, width, height, selected } = data;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        width,
        height,
        background: selected ? `${color}0a` : hovered ? `${color}08` : `${color}05`,
        border: `1px solid ${selected ? `${color}40` : hovered ? `${color}30` : `${color}15`}`,
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'border-color 0.2s, background 0.2s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: `${color}90`,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            userSelect: 'none',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 10,
            color: `${color}50`,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            userSelect: 'none',
          }}
        >
          Enter ›
        </span>
      </div>
    </div>
  );
});
