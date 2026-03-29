import { memo } from 'react';
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

  return (
    <div
      style={{
        width,
        height,
        background: selected ? `${color}0a` : `${color}05`,
        border: `1px solid ${selected ? `${color}40` : `${color}15`}`,
        borderRadius: 12,
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      <div
        style={{
          padding: '8px 14px',
          fontSize: 10,
          fontWeight: 600,
          color: `${color}90`,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          userSelect: 'none',
        }}
      >
        {label}
      </div>
    </div>
  );
});
