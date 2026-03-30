import { Router, type Request, type Response } from 'express';
import { type WorldModelStore } from '../store.js';
import { computeMapProjection, type MapProjection } from '../projection/layout.js';
import {
  type EntityKind,
  type RelationshipKind,
  type Confidence,
} from '../ontology.js';

export function createRouter(store: WorldModelStore): Router {
  const router = Router();

  // ─── Model Snapshot ──────────────────────────────────────

  router.get('/model', (_req: Request, res: Response) => {
    res.json(store.getSnapshot());
  });

  // ─── Summary ─────────────────────────────────────────────

  router.get('/summary', (_req: Request, res: Response) => {
    res.json(store.getSummary());
  });

  // ─── Entities ────────────────────────────────────────────

  router.get('/entities', (req: Request, res: Response) => {
    const entities = store.queryEntities({
      kind: req.query.kind as EntityKind | undefined,
      namePattern: req.query.namePattern as string | undefined,
      involves: req.query.involves as string | undefined,
      minConfidence: req.query.minConfidence as Confidence | undefined,
      parentBoundary: req.query.parentBoundary as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json({ entities, total: entities.length });
  });

  router.get('/entities/:id', (req: Request, res: Response) => {
    const id = decodeURIComponent(req.params.id as string);
    const details = store.getEntityDetails(id);
    if (!details) {
      res.status(404).json({ error: `Entity not found: ${id}` });
      return;
    }
    res.json(details);
  });

  // ─── Relationships ───────────────────────────────────────

  router.get('/relationships', (req: Request, res: Response) => {
    const relationships = store.queryRelationships({
      kind: req.query.kind as RelationshipKind | undefined,
      source: req.query.source as string | undefined,
      target: req.query.target as string | undefined,
      involves: req.query.involves as string | undefined,
      minConfidence: req.query.minConfidence as Confidence | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json({ relationships, total: relationships.length });
  });

  // ─── Slices ──────────────────────────────────────────────

  router.get('/slices', (_req: Request, res: Response) => {
    res.json({ slices: store.getSlices() });
  });

  // ─── Perspectives ────────────────────────────────────────

  router.get('/perspectives', (_req: Request, res: Response) => {
    res.json({
      perspectives: store.listPerspectives(),
      active: store.getActivePerspective().id,
    });
  });

  router.post('/perspective/from-boundary', (req: Request, res: Response) => {
    const { boundaryId } = req.body as { boundaryId: string };
    const perspective = store.createPerspectiveFromBoundary(boundaryId);
    if (!perspective) {
      res.status(404).json({ error: `Boundary not found or empty: ${boundaryId}` });
      return;
    }
    res.json({
      perspectiveId: perspective.id,
      name: perspective.name,
      entityCount: perspective.entityIds.length,
    });
  });

  router.post('/perspective/switch', (req: Request, res: Response) => {
    const { id } = req.body as { id: string };
    const perspective = store.switchPerspective(id);
    if (!perspective) {
      res.status(404).json({ error: `Perspective not found: ${id}` });
      return;
    }
    res.json({ switched: perspective.name });
  });

  // ─── Map Projection ──────────────────────────────────────

  const projectionCache = new Map<string, MapProjection>();
  let projectionsDirty = true;

  // Only invalidate layout on topology changes (new nodes/edges), not evidence updates
  store.on('entity:added', () => { projectionsDirty = true; });
  store.on('relationship:added', () => { projectionsDirty = true; });
  store.on('model:cleared', () => {
    projectionsDirty = true;
    projectionCache.clear();
  });

  router.get('/projection/map', (req: Request, res: Response) => {
    // Accept ?perspective=perspective:auth to render a specific perspective
    // without changing the server's active perspective
    const perspectiveId = (req.query.perspective as string | undefined) ?? undefined;
    const cacheKey = perspectiveId ?? '__active__';

    if (projectionsDirty) {
      projectionCache.clear();
      projectionsDirty = false;
    }

    let projection = projectionCache.get(cacheKey);
    if (!projection) {
      const snapshot = store.getSnapshot();
      // Temporarily override activePerspectiveId if a specific perspective is requested
      if (perspectiveId) {
        snapshot.activePerspectiveId = perspectiveId;
      }
      projection = computeMapProjection(snapshot);
      projectionCache.set(cacheKey, projection);
    }
    res.json(projection);
  });

  return router;
}
