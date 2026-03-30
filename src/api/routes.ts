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

  let cachedProjection: MapProjection | null = null;
  let projectionDirty = true;

  store.on('entity:added', () => { projectionDirty = true; });
  store.on('entity:updated', () => { projectionDirty = true; });
  store.on('relationship:added', () => { projectionDirty = true; });
  store.on('relationship:updated', () => { projectionDirty = true; });
  store.on('model:cleared', () => {
    projectionDirty = true;
    cachedProjection = null;
  });

  router.get('/projection/map', (_req: Request, res: Response) => {
    if (projectionDirty || !cachedProjection) {
      const snapshot = store.getSnapshot();
      cachedProjection = computeMapProjection(snapshot);
      projectionDirty = false;
    }
    res.json(cachedProjection);
  });

  return router;
}
