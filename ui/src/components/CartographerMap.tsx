import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SemanticNode } from './SemanticNode';
import { BoundaryNode } from './BoundaryNode';
import type { MapProjection } from '../lib/api';

// ─── Kind → Color mapping ──────────────────────────────────────

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

// ─── Edge styles ───────────────────────────────────────────────

const EDGE_COLORS: Record<string, string> = {
  contains: '#27272a',
  invokes: '#7c3aed50',
  renders: '#6366f150',
  reads: '#06b6d440',
  writes: '#f59e0b50',
  'depends-on': '#3f3f4640',
  triggers: '#ef444450',
  produces: '#10b98150',
  consumes: '#dc262650',
  guards: '#10b98140',
  exposes: '#6366f140',
  'enters-at': '#3b82f650',
};

const DASHED_EDGES = new Set(['contains', 'depends-on', 'guards', 'exposes']);

const CONFIDENCE_OPACITY: Record<string, number> = {
  proven: 0.8,
  high: 0.6,
  medium: 0.45,
  low: 0.3,
  speculative: 0.15,
};

// ─── Node types ────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  semantic: SemanticNode,
  boundary: BoundaryNode,
};

// ─── Conversion helpers ────────────────────────────────────────

function toFlowNodes(
  projection: MapProjection,
  selectedEntityId: string | null,
  activeFlowEntityIds: Set<string> | null,
  activeFlowStepMap: Map<string, number> | null,
): Node[] {
  // Boundaries first (groups must be declared before children in React Flow)
  const sorted = [...projection.nodes].sort((a, b) => {
    if (a.isGroup && !b.isGroup) return -1;
    if (!a.isGroup && b.isGroup) return 1;
    return 0;
  });

  const hasActiveFlow = activeFlowEntityIds !== null && activeFlowEntityIds.size > 0;

  return sorted.map((n) => {
    const color = KIND_COLORS[n.kind] ?? '#71717a';
    const onFlow = activeFlowEntityIds?.has(n.id) ?? false;
    const flowStep = activeFlowStepMap?.get(n.id) ?? undefined;
    // Dim nodes not on the active flow
    const dimmed = hasActiveFlow && !onFlow && !n.isGroup;

    if (n.isGroup) {
      return {
        id: n.id,
        type: 'boundary',
        position: { x: n.x, y: n.y },
        draggable: true,
        style: { width: n.width, height: n.height },
        data: {
          label: n.name,
          color,
          width: n.width,
          height: n.height,
          selected: n.id === selectedEntityId,
        },
      };
    }

    return {
      id: n.id,
      type: 'semantic',
      position: { x: n.x, y: n.y },
      draggable: true,
      ...(n.parentId ? { parentId: n.parentId } : {}),
      data: {
        label: n.name,
        kind: n.kind,
        description: n.description,
        confidence: n.bestConfidence,
        evidenceCount: n.evidenceCount,
        color,
        selected: n.id === selectedEntityId,
        dimmed,
        onFlow,
        flowStep,
        contextual: n.contextual ?? false,
      },
    };
  });
}

function toFlowEdges(projection: MapProjection, selectedEntityId: string | null): Edge[] {
  return projection.edges
    // Skip 'contains' edges — containment is shown by nesting
    .filter((e) => e.kind !== 'contains')
    .map((e) => {
      const color = EDGE_COLORS[e.kind] ?? '#27272a';
      const dashed = DASHED_EDGES.has(e.kind);
      const opacity = CONFIDENCE_OPACITY[e.bestConfidence] ?? 0.4;
      const isHighlighted =
        selectedEntityId !== null &&
        (e.source === selectedEntityId || e.target === selectedEntityId);

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        style: {
          stroke: isHighlighted ? color.replace(/[0-9a-f]{2}$/i, 'ff') : color,
          strokeDasharray: dashed ? '6 4' : undefined,
          opacity: isHighlighted ? 1 : opacity,
          strokeWidth: isHighlighted ? 2 : 1,
          transition: 'opacity 0.2s, stroke-width 0.2s',
        },
      };
    });
}

// ─── Component ─────────────────────────────────────────────────

interface Props {
  projection: MapProjection;
  selectedEntityId: string | null;
  activeFlowEntityIds: Set<string> | null;
  onNodeClick: (entityId: string) => void;
  onBoundaryClick: (boundaryId: string) => void;
}

export function CartographerMap({ projection, selectedEntityId, activeFlowEntityIds, onNodeClick, onBoundaryClick }: Props) {
  // Build a step-number map from the active flow
  const activeFlowStepMap = useMemo(
    () =>
      activeFlowEntityIds
        ? new Map(Array.from(activeFlowEntityIds).map((id, i) => [id, i + 1]))
        : null,
    [activeFlowEntityIds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(
    toFlowNodes(projection, selectedEntityId, activeFlowEntityIds, activeFlowStepMap),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(projection, selectedEntityId),
  );

  useEffect(() => {
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]));
      return toFlowNodes(projection, selectedEntityId, activeFlowEntityIds, activeFlowStepMap).map((n) => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
      }));
    });
    setEdges(toFlowEdges(projection, selectedEntityId));
  }, [selectedEntityId, activeFlowEntityIds, projection, setNodes, setEdges, activeFlowStepMap]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type === 'boundary') {
        onBoundaryClick(node.id);
      } else {
        onNodeClick(node.id);
      }
    },
    [onNodeClick, onBoundaryClick],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#18181b" gap={32} size={1} />
      <Controls position="bottom-left" showInteractive={false} />
      <MiniMap
        nodeColor={(node) => {
          const d = node.data as { color?: string };
          return d.color ?? '#71717a';
        }}
        maskColor="rgba(0, 0, 0, 0.8)"
        nodeStrokeWidth={0}
        nodeBorderRadius={3}
        position="bottom-right"
        style={{ height: 100, width: 140 }}
      />
    </ReactFlow>
  );
}
