import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { type WorldModelStore } from '../store.js';
import {
  ENTITY_KINDS,
  RELATIONSHIP_KINDS,
  CONFIDENCE_LEVELS,
  CONFIDENCE_RANK,
  PROVENANCE_KINDS,
  type EntityKind,
  type RelationshipKind,
  type Confidence,
  type Provenance,
  type SourceAnchor,
} from '../ontology.js';
import { execFile } from 'child_process';
import * as fs from 'fs';

// MCP transport may deliver arrays/objects as JSON strings instead of parsed values.
// This safely parses them at runtime.
function ensureParsed<T>(value: T | string): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return value as unknown as T; }
  }
  return value;
}
import * as path from 'path';

// ─── Schema Fragments ──────────────────────────────────────────

const anchorSchema = {
  type: 'object' as const,
  properties: {
    filePath: { type: 'string' as const, description: 'Path relative to project root' },
    lineStart: { type: 'number' as const },
    lineEnd: { type: 'number' as const },
    snippet: { type: 'string' as const, description: 'Verbatim source text' },
  },
  required: ['filePath', 'lineStart', 'lineEnd', 'snippet'],
};

const evidenceSchema = {
  type: 'object' as const,
  properties: {
    anchors: {
      type: 'array' as const,
      items: anchorSchema,
      description: 'Source locations grounding this fact',
    },
    confidence: {
      type: 'string' as const,
      enum: [...CONFIDENCE_LEVELS],
      description: 'proven=from source, high=one inference step, medium/low=weaker, speculative=hypothesis',
    },
    provenance: {
      type: 'string' as const,
      enum: [...PROVENANCE_KINDS],
      description: 'How this fact was established',
    },
    reasoning: {
      type: 'string' as const,
      description: 'Required when confidence is not proven. Explain the inference.',
    },
    supportingFacts: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'IDs of facts this was inferred from',
    },
  },
  required: ['anchors', 'confidence', 'provenance'],
};

// ─── Tool Definitions ──────────────────────────────────────────

const TOOLS = [
  {
    name: 'cartographer_write_entity',
    description:
      'Record a discovered entity in the world-model. Creates if new (by kind+name), appends evidence if existing. Every entity must have at least one source anchor.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        kind: {
          type: 'string' as const,
          enum: [...ENTITY_KINDS],
          description: 'The ontological kind of entity',
        },
        name: {
          type: 'string' as const,
          description: 'Human-readable identifier (e.g., "auth", "createOrder", "UserSession")',
        },
        description: {
          type: 'string' as const,
          description: 'What this entity is or does',
        },
        evidence: evidenceSchema,
        parentBoundary: {
          type: 'string' as const,
          description: 'Entity ID of the containing boundary (e.g., "boundary:auth")',
        },
        metadata: {
          type: 'object' as const,
          description: 'Optional key-value pairs',
        },
      },
      required: ['kind', 'name', 'evidence'],
    },
  },
  {
    name: 'cartographer_write_relationship',
    description:
      'Record a relationship between two entities. Source and target must be entity IDs (e.g., "capability:createOrder"). Appends evidence if relationship already exists.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        kind: {
          type: 'string' as const,
          enum: [...RELATIONSHIP_KINDS],
          description: 'The kind of relationship',
        },
        source: {
          type: 'string' as const,
          description: 'Source entity ID',
        },
        target: {
          type: 'string' as const,
          description: 'Target entity ID',
        },
        description: {
          type: 'string' as const,
          description: 'What this relationship means',
        },
        evidence: evidenceSchema,
      },
      required: ['kind', 'source', 'target', 'evidence'],
    },
  },
  {
    name: 'cartographer_query',
    description:
      'Query the world-model for entities and relationships matching criteria.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        entityKind: {
          type: 'string' as const,
          enum: [...ENTITY_KINDS],
          description: 'Filter entities by kind',
        },
        relationshipKind: {
          type: 'string' as const,
          enum: [...RELATIONSHIP_KINDS],
          description: 'Filter relationships by kind',
        },
        involves: {
          type: 'string' as const,
          description: 'Entity ID that must be source or target',
        },
        namePattern: {
          type: 'string' as const,
          description: 'Regex to match entity names',
        },
        minConfidence: {
          type: 'string' as const,
          enum: [...CONFIDENCE_LEVELS],
          description: 'Minimum confidence level',
        },
        limit: {
          type: 'number' as const,
          description: 'Max results (default 50)',
        },
      },
    },
  },
  {
    name: 'cartographer_write_slice',
    description:
      'Record a behavior slice or changeset. For flows: a storyline of what happens when an action occurs. For changesets (PRs): the entities affected by a change, with change types.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string' as const,
          description: 'Short name (e.g., "Fact write lifecycle" or "PR #123: Add auth")',
        },
        description: {
          type: 'string' as const,
          description: 'What this represents',
        },
        kind: {
          type: 'string' as const,
          enum: ['flow', 'changeset'],
          description: '"flow" for behavior narratives (default), "changeset" for PR reviews',
        },
        steps: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              entityId: {
                type: 'string' as const,
                description: 'Entity ID for this step (e.g., "actor:MCP stdio")',
              },
              label: {
                type: 'string' as const,
                description: 'What happens at this step or what changed',
              },
              changeType: {
                type: 'string' as const,
                enum: ['added', 'modified', 'removed', 'affected'],
                description: 'For changesets: the type of change at this entity',
              },
            },
            required: ['entityId'],
          },
          description: 'Ordered steps through the system',
        },
        evidence: evidenceSchema,
      },
      required: ['name', 'steps', 'evidence'],
    },
  },
  {
    name: 'cartographer_get_entity',
    description:
      'Get full details for an entity including all relationships and evidence.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: 'Entity ID (e.g., "boundary:auth", "capability:createOrder")',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'cartographer_set_project',
    description:
      'Set the project root for the current analysis session. MUST be called before writing any entities. Pass the absolute path to the project being analyzed. This stores the world-model in {projectRoot}/.cartographer/model.json and loads any existing model for that project.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        rootPath: {
          type: 'string' as const,
          description: 'Absolute path to the project root (e.g., "/Users/me/my-project")',
        },
      },
      required: ['rootPath'],
    },
  },
  {
    name: 'cartographer_create_perspective',
    description:
      'Create a named perspective AND switch to it. Entities and slices written after this call auto-join the new perspective. No need to call switch_perspective separately.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string' as const,
          description: 'Perspective name (e.g., "auth", "data-pipeline", "checkout-flow")',
        },
        description: {
          type: 'string' as const,
          description: 'What this perspective focuses on',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'cartographer_switch_perspective',
    description:
      'Switch the active perspective. Entities and slices written after this call will auto-join the new active perspective. Use "default" to switch back to the full overview.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string' as const,
          description: 'Perspective name (e.g., "auth") or "default" for the full overview',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'cartographer_list_perspectives',
    description: 'List all perspectives with their entity and slice counts.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'cartographer_snapshot',
    description: 'Save a snapshot of the current world-model. Use before risky operations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        label: {
          type: 'string' as const,
          description: 'Optional label for this snapshot (e.g., "before-refactor")',
        },
      },
    },
  },
  {
    name: 'cartographer_list_snapshots',
    description: 'List available snapshots that can be restored.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'cartographer_restore',
    description: 'Restore the world-model from a snapshot. Saves current state before restoring.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filename: {
          type: 'string' as const,
          description: 'Snapshot filename from cartographer_list_snapshots',
        },
      },
      required: ['filename'],
    },
  },
  {
    name: 'cartographer_get_summary',
    description: 'Get current world-model statistics: entity/relationship counts, confidence distribution.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'cartographer_open_map',
    description: 'Open the Cartographer browser UI to view the current map projection.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        focus: {
          type: 'string' as const,
          description: 'Optional entity ID to focus on',
        },
      },
    },
  },
  {
    name: 'cartographer_delete_entity',
    description: 'Delete an entity and all its relationships from the model. Use to correct mistakes or remove stale entities.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: 'Entity ID to delete (e.g., "capability:oldFunction")',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'cartographer_clear',
    description: 'Reset the world-model. Destructive — removes all entities and relationships.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        confirm: {
          type: 'boolean' as const,
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['confirm'],
    },
  },
];

// ─── Register Tools ────────────────────────────────────────────

export function registerTools(server: Server, store: WorldModelStore, dataDir: string): void {
  // Read port from file at call time (written by HTTP server after it binds)
  function getPort(): number {
    try {
      return parseInt(fs.readFileSync(path.join(dataDir, 'port'), 'utf-8').trim(), 10);
    } catch {
      return 3847; // fallback
    }
  }
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'cartographer_write_entity': {
        const { kind, name: entityName, description, evidence, parentBoundary, metadata } =
          args as {
            kind: EntityKind;
            name: string;
            description?: string;
            evidence: {
              anchors: SourceAnchor[];
              confidence: Confidence;
              provenance: Provenance;
              reasoning?: string;
              supportingFacts?: string[];
            };
            parentBoundary?: string;
            metadata?: Record<string, unknown>;
          };

        const ev = ensureParsed(evidence) ?? { anchors: [], confidence: 'speculative' as Confidence, provenance: 'inferred' as Provenance };
        const result = store.writeEntity({
          kind,
          name: entityName,
          description,
          evidence: {
            anchors: ensureParsed(ev.anchors) ?? [],
            confidence: ev.confidence ?? 'speculative',
            provenance: ev.provenance ?? 'inferred',
            reasoning: ev.reasoning,
            tool: 'agent',
            supportingFacts: ev.supportingFacts,
          },
          parentBoundary,
          metadata,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
        };
      }

      case 'cartographer_write_relationship': {
        const { kind, source, target, description, evidence } =
          args as {
            kind: RelationshipKind;
            source: string;
            target: string;
            description?: string;
            evidence: {
              anchors: SourceAnchor[];
              confidence: Confidence;
              provenance: Provenance;
              reasoning?: string;
              supportingFacts?: string[];
            };
          };

        const ev2 = ensureParsed(evidence) ?? { anchors: [], confidence: 'speculative' as Confidence, provenance: 'inferred' as Provenance };
        const result = store.writeRelationship({
          kind,
          source,
          target,
          description,
          evidence: {
            anchors: ensureParsed(ev2.anchors) ?? [],
            confidence: ev2.confidence ?? 'speculative',
            provenance: ev2.provenance ?? 'inferred',
            reasoning: ev2.reasoning,
            tool: 'agent',
            supportingFacts: ev2.supportingFacts,
          },
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      }

      case 'cartographer_query': {
        const { entityKind, relationshipKind, involves, namePattern, minConfidence, limit } =
          args as {
            entityKind?: EntityKind;
            relationshipKind?: RelationshipKind;
            involves?: string;
            namePattern?: string;
            minConfidence?: Confidence;
            limit?: number;
          };

        const entities = store.queryEntities({
          kind: entityKind,
          namePattern,
          involves,
          minConfidence,
          limit,
        });

        const relationships = store.queryRelationships({
          kind: relationshipKind,
          involves,
          minConfidence,
          limit,
        });

        // Return lightweight summaries — use get_entity for full details
        const entitySummaries = entities.map((e) => ({
          id: e.id,
          kind: e.kind,
          name: e.name,
          description: e.description,
          parentBoundary: e.parentBoundary,
          evidenceCount: e.evidence.length,
          bestConfidence: e.evidence.length > 0
            ? e.evidence.reduce((best, ev) =>
                (CONFIDENCE_RANK[ev.confidence] > CONFIDENCE_RANK[best]) ? ev.confidence : best,
                'speculative' as Confidence)
            : 'speculative',
        }));

        const relSummaries = relationships.map((r) => ({
          id: r.id,
          kind: r.kind,
          source: r.source,
          target: r.target,
          description: r.description,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                entities: entitySummaries,
                relationships: relSummaries,
                totalEntities: entities.length,
                totalRelationships: relationships.length,
              }),
            },
          ],
        };
      }

      case 'cartographer_write_slice': {
        const { name: sliceName, description, kind, steps, evidence } =
          args as {
            name: string;
            description?: string;
            kind?: 'flow' | 'changeset';
            steps: { entityId: string; label?: string; changeType?: string }[];
            evidence: {
              anchors: SourceAnchor[];
              confidence: Confidence;
              provenance: Provenance;
              reasoning?: string;
              supportingFacts?: string[];
            };
          };

        const parsedSteps = ensureParsed(steps);
        const parsedEvidence = ensureParsed(evidence);
        const ev3 = parsedEvidence ?? { anchors: [], confidence: 'speculative' as Confidence, provenance: 'inferred' as Provenance };
        const result = store.writeSlice({
          name: sliceName,
          description,
          kind,
          steps: (Array.isArray(parsedSteps) ? parsedSteps : []).map((s) => ({
            entityId: s.entityId,
            label: s.label,
            changeType: s.changeType as import('../ontology.js').ChangeType | undefined,
          })),
          evidence: {
            anchors: ensureParsed(ev3.anchors) ?? [],
            confidence: ev3.confidence ?? 'speculative',
            provenance: ev3.provenance ?? 'inferred',
            reasoning: ev3.reasoning,
            tool: 'agent',
            supportingFacts: ev3.supportingFacts,
          },
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      }

      case 'cartographer_get_entity': {
        const { id } = args as { id: string };
        const details = store.getEntityDetails(id);
        if (!details) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Entity not found: ${id}` }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(details) }],
        };
      }

      case 'cartographer_create_perspective': {
        const { name: perspName, description } =
          args as { name: string; description?: string };
        const perspective = store.createPerspective({ name: perspName, description });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                id: perspective.id,
                name: perspective.name,
                description: perspective.description,
              }),
            },
          ],
        };
      }

      case 'cartographer_switch_perspective': {
        const { name: perspName } = args as { name: string };
        const id = `perspective:${perspName}`;
        const perspective = store.switchPerspective(id);
        if (!perspective) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Perspective not found: ${perspName}. Use cartographer_list_perspectives to see available perspectives, or cartographer_create_perspective to create one.`,
                }),
              },
            ],
            isError: true,
          };
        }
        const summary = store.getSummary();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                switched: perspective.name,
                entityCount: perspective.isDefault ? summary.entityCount : perspective.entityIds.length,
                sliceCount: perspective.isDefault ? summary.sliceCount : perspective.sliceIds.length,
              }),
            },
          ],
        };
      }

      case 'cartographer_list_perspectives': {
        const perspectives = store.listPerspectives().map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          entityCount: p.isDefault ? store.getSummary().entityCount : p.entityIds.length,
          sliceCount: p.isDefault ? store.getSummary().sliceCount : p.sliceIds.length,
          isDefault: p.isDefault ?? false,
          isActive: p.id === store.getActivePerspective().id,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ perspectives }) }],
        };
      }

      case 'cartographer_set_project': {
        const { rootPath } = args as { rootPath: string };
        store.setProject(rootPath);
        const summary = store.getSummary();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                rootPath,
                loaded: summary.entityCount > 0,
                entityCount: summary.entityCount,
                relationshipCount: summary.relationshipCount,
              }),
            },
          ],
        };
      }

      case 'cartographer_snapshot': {
        const { label } = (args ?? {}) as { label?: string };
        const filename = store.saveSnapshot(label);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ saved: filename }) }],
        };
      }

      case 'cartographer_list_snapshots': {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ snapshots: store.listSnapshots() }) }],
        };
      }

      case 'cartographer_restore': {
        const { filename } = args as { filename: string };
        const restored = store.restoreSnapshot(filename);
        if (!restored) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Snapshot not found: ${filename}` }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ restored: filename }) }],
        };
      }

      case 'cartographer_get_summary': {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(store.getSummary()) }],
        };
      }

      case 'cartographer_open_map': {
        const { focus } = (args ?? {}) as { focus?: string };
        const activePort = getPort();
        const url = focus
          ? `http://localhost:${activePort}?focus=${encodeURIComponent(focus)}`
          : `http://localhost:${activePort}`;

        // Open browser safely using execFile (no shell injection)
        const cmd = process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open';
        const cmdArgs = process.platform === 'win32' ? ['/c', 'start', url] : [url];
        execFile(cmd, cmdArgs, (err) => {
          if (err) console.error('[cartographer] Failed to open browser:', err.message);
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ url, message: 'Map opened in browser' }),
            },
          ],
        };
      }

      case 'cartographer_delete_entity': {
        const { id } = args as { id: string };
        const deleted = store.deleteEntity(id);
        if (!deleted) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Entity not found: ${id}` }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ deleted: id }) }],
        };
      }

      case 'cartographer_clear': {
        const { confirm } = args as { confirm: boolean };
        if (!confirm) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ error: 'Must set confirm: true' }) },
            ],
            isError: true,
          };
        }
        store.clear();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ cleared: true }) }],
        };
      }

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });
}
