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
  PROVENANCE_KINDS,
  type EntityKind,
  type RelationshipKind,
  type Confidence,
  type Provenance,
  type SourceAnchor,
} from '../ontology.js';
import { execFile } from 'child_process';
import * as fs from 'fs';
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
      'Record a behavior slice — a named storyline showing what happens when a specific action occurs. Steps are an ordered list of entity IDs with optional labels describing what happens at each step.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string' as const,
          description: 'Short name for the flow (e.g., "Fact write lifecycle", "Map render pipeline")',
        },
        description: {
          type: 'string' as const,
          description: 'What this flow represents — when does it happen, what triggers it',
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
                description: 'What happens at this step (e.g., "receives tool call", "persists to disk")',
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
      'Create a named perspective (lens) over the shared entity pool. Use for focused analysis of a specific concern — e.g., "auth", "data-pipeline", "checkout-flow". Entities written while this perspective is active will auto-join it.',
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

        const ev = evidence ?? { anchors: [], confidence: 'speculative' as Confidence, provenance: 'inferred' as Provenance };
        const result = store.writeEntity({
          kind,
          name: entityName,
          description,
          evidence: {
            anchors: ev.anchors ?? [],
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

        const ev2 = evidence ?? { anchors: [], confidence: 'speculative' as Confidence, provenance: 'inferred' as Provenance };
        const result = store.writeRelationship({
          kind,
          source,
          target,
          description,
          evidence: {
            anchors: ev2.anchors ?? [],
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

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                entities,
                relationships,
                totalEntities: entities.length,
                totalRelationships: relationships.length,
              }),
            },
          ],
        };
      }

      case 'cartographer_write_slice': {
        const { name: sliceName, description, steps, evidence } =
          args as {
            name: string;
            description?: string;
            steps: { entityId: string; label?: string }[];
            evidence: {
              anchors: SourceAnchor[];
              confidence: Confidence;
              provenance: Provenance;
              reasoning?: string;
              supportingFacts?: string[];
            };
          };

        const ev3 = evidence ?? { anchors: [], confidence: 'speculative' as Confidence, provenance: 'inferred' as Provenance };
        const result = store.writeSlice({
          name: sliceName,
          description,
          steps,
          evidence: {
            anchors: ev3.anchors ?? [],
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
