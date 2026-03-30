import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CartographerMap } from './components/CartographerMap';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import { FlowPanel } from './components/FlowPanel';
import { PerspectiveSelector } from './components/PerspectiveSelector';
import { Breadcrumb, type BreadcrumbSegment } from './components/Breadcrumb';
import {
  fetchEntityDetails,
  fetchSummary,
  fetchSlices,
  createPerspectiveFromBoundary,
  type MapProjection,
  type EntityDetails,
  type ModelSummary,
  type BehaviorSlice,
} from './lib/api';
import { connectWebSocket } from './lib/ws';

function getPerspectiveFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('perspective');
}

function setPerspectiveInUrl(perspectiveId: string | null) {
  const url = new URL(window.location.href);
  if (perspectiveId && perspectiveId !== 'perspective:default') {
    url.searchParams.set('perspective', perspectiveId);
  } else {
    url.searchParams.delete('perspective');
  }
  window.history.replaceState({}, '', url.toString());
}

export function App() {
  const [projection, setProjection] = useState<MapProjection | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityDetails | null>(null);
  const [summary, setSummary] = useState<ModelSummary | null>(null);
  const [slices, setSlices] = useState<BehaviorSlice[]>([]);
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [clientPerspective, setClientPerspective] = useState<string | null>(
    getPerspectiveFromUrl,
  );
  const [navPath, setNavPath] = useState<BreadcrumbSegment[]>([
    { id: null, name: 'Overview' },
  ]);

  // Use a ref so WebSocket-triggered loads always use the latest perspective,
  // not the stale closure value from when the callback was created.
  const perspectiveRef = useRef(clientPerspective);
  perspectiveRef.current = clientPerspective;

  const loadData = useCallback(async () => {
    try {
      const persp = perspectiveRef.current;
      const perspParam = persp
        ? `?perspective=${encodeURIComponent(persp)}`
        : '';
      const [proj, sum, sl] = await Promise.all([
        fetch(`/api/projection/map${perspParam}`).then((r) => r.json()),
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

  // Load on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when perspective changes
  useEffect(() => {
    loadData();
  }, [clientPerspective, loadData]);

  // WebSocket for live updates — connect ONCE, use ref to call latest loadData
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

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
        loadDataRef.current();
      }
    });

    ws.addEventListener('open', () => setConnected(true));
    ws.addEventListener('close', () => setConnected(false));

    return () => ws.close();
  }, []);

  const handleNodeClick = useCallback(async (entityId: string) => {
    try {
      const details = await fetchEntityDetails(entityId);
      setSelectedEntity(details);
    } catch {
      // Entity might not exist
    }
  }, []);

  const handleBoundaryClick = useCallback(async (boundaryId: string) => {
    try {
      const result = await createPerspectiveFromBoundary(boundaryId);
      const perspId = result.perspectiveId;
      setClientPerspective(perspId);
      setPerspectiveInUrl(perspId);
      setNavPath((prev) => [...prev, { id: perspId, name: result.name }]);
    } catch {
      // Boundary might not have children
    }
  }, []);

  const handleBreadcrumbNavigate = useCallback((perspectiveId: string | null) => {
    setClientPerspective(perspectiveId);
    setPerspectiveInUrl(perspectiveId);
    // Pop the nav path back to this level
    setNavPath((prev) => {
      const idx = prev.findIndex((s) => s.id === perspectiveId);
      return idx >= 0 ? prev.slice(0, idx + 1) : [{ id: null, name: 'Overview' }];
    });
  }, []);

  const handlePerspectiveSwitch = useCallback((id: string) => {
    const isDefault = id === 'perspective:default';
    setClientPerspective(isDefault ? null : id);
    setPerspectiveInUrl(isDefault ? null : id);
    // Reset nav path when switching perspectives via tabs
    setNavPath([{ id: isDefault ? null : id, name: isDefault ? 'Overview' : id.replace('perspective:', '') }]);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedEntity(null);
  }, []);

  const activeSlice = useMemo(
    () => (activeSliceId ? slices.find((s) => s.id === activeSliceId) ?? null : null),
    [activeSliceId, slices],
  );

  const activeFlowEntityIds = useMemo(
    () => (activeSlice && Array.isArray(activeSlice.steps) ? new Set(activeSlice.steps.map((s) => s.entityId)) : null),
    [activeSlice],
  );

  const activeFlowChangeTypes = useMemo(
    () => {
      if (!activeSlice || activeSlice.kind !== 'changeset') return null;
      const map = new Map<string, string>();
      for (const step of activeSlice.steps) {
        if (step.changeType) map.set(step.entityId, step.changeType);
      }
      return map.size > 0 ? map : null;
    },
    [activeSlice],
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
              activeFlowChangeTypes={activeFlowChangeTypes}
              onNodeClick={handleNodeClick}
              onBoundaryClick={handleBoundaryClick}
            />
          </ReactFlowProvider>
        )}
        <StatusBar connected={connected} summary={summary} />
        <Breadcrumb path={navPath} onNavigate={handleBreadcrumbNavigate} />
        {projection && projection.perspectives.length > 1 && (
          <PerspectiveSelector
            perspectives={projection.perspectives}
            activePerspective={clientPerspective ?? 'perspective:default'}
            onSwitch={handlePerspectiveSwitch}
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
