import { useState, useEffect, useCallback, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CartographerMap } from './components/CartographerMap';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import { FlowPanel } from './components/FlowPanel';
import { PerspectiveSelector } from './components/PerspectiveSelector';
import {
  fetchProjection,
  fetchEntityDetails,
  fetchSummary,
  fetchSlices,
  type MapProjection,
  type EntityDetails,
  type ModelSummary,
  type BehaviorSlice,
} from './lib/api';
import { connectWebSocket } from './lib/ws';

export function App() {
  const [projection, setProjection] = useState<MapProjection | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityDetails | null>(null);
  const [summary, setSummary] = useState<ModelSummary | null>(null);
  const [slices, setSlices] = useState<BehaviorSlice[]>([]);
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [proj, sum, sl] = await Promise.all([
        fetchProjection(),
        fetchSummary(),
        fetchSlices(),
      ]);
      setProjection(proj);
      setSummary(sum);
      setSlices(sl);
    } catch {
      // Service not ready yet
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket for live updates
  useEffect(() => {
    const ws = connectWebSocket((message) => {
      setConnected(true);
      if (
        message.type === 'entity:added' ||
        message.type === 'entity:updated' ||
        message.type === 'relationship:added' ||
        message.type === 'relationship:updated' ||
        message.type === 'slice:added' ||
        message.type === 'slice:updated' ||
        message.type === 'model:cleared' ||
        message.type === 'snapshot'
      ) {
        loadData();
      }
    });

    ws.addEventListener('open', () => setConnected(true));
    ws.addEventListener('close', () => setConnected(false));

    return () => ws.close();
  }, [loadData]);

  const handleNodeClick = useCallback(async (entityId: string) => {
    try {
      const details = await fetchEntityDetails(entityId);
      setSelectedEntity(details);
    } catch {
      // Entity might not exist
    }
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedEntity(null);
  }, []);

  // Compute the set of entity IDs on the active flow path
  const activeFlowEntityIds = useMemo(
    () =>
      activeSliceId
        ? new Set(
            slices
              .find((s) => s.id === activeSliceId)
              ?.steps.map((s) => s.entityId) ?? [],
          )
        : null,
    [activeSliceId, slices],
  );

  const isEmpty = !projection || projection.nodes.length === 0;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Main map area */}
      <div style={{ flex: 1, position: 'relative' }}>
        {isEmpty ? (
          <EmptyState connected={connected} summary={summary} />
        ) : (
          <ReactFlowProvider>
            <CartographerMap
              projection={projection}
              selectedEntityId={selectedEntity?.entity.id ?? null}
              activeFlowEntityIds={activeFlowEntityIds}
              onNodeClick={handleNodeClick}
            />
          </ReactFlowProvider>
        )}
        <StatusBar connected={connected} summary={summary} />
        {projection && projection.perspectives.length > 1 && (
          <PerspectiveSelector
            perspectives={projection.perspectives}
            activePerspective={projection.activePerspective}
            onSwitch={async (id) => {
              // Switch perspective via API, then reload
              await fetch(`/api/perspective/switch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
              });
              loadData();
            }}
          />
        )}
        {slices.length > 0 && (
          <FlowPanel
            slices={slices}
            activeSliceId={activeSliceId}
            onSelectSlice={setActiveSliceId}
          />
        )}
      </div>

      {/* Inspector panel */}
      {selectedEntity && (
        <Inspector
          details={selectedEntity}
          slices={slices}
          onClose={handleCloseInspector}
        />
      )}
    </div>
  );
}

function EmptyState({ connected, summary }: { connected: boolean; summary: ModelSummary | null }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        gap: 16,
        padding: 40,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.3 }}>&#x25CE;</div>
      <div style={{ fontSize: 18, color: 'var(--text)', fontWeight: 500 }}>
        Cartographer
      </div>
      <div style={{ maxWidth: 400, lineHeight: 1.6 }}>
        {connected ? (
          <>
            Connected to service. The map is empty.
            <br />
            <span style={{ color: 'var(--text-dim)' }}>
              Use Claude Code with the <code>/cartographer analyze</code> command
              to start building the world-model.
            </span>
          </>
        ) : (
          <>
            Waiting for connection to local service...
            <br />
            <span style={{ color: 'var(--text-dim)' }}>
              Start the service with <code>npm run dev:service</code>
            </span>
          </>
        )}
      </div>
      {summary && summary.entityCount > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {summary.entityCount} entities, {summary.relationshipCount} relationships stored
        </div>
      )}
    </div>
  );
}
