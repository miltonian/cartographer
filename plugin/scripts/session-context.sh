#!/bin/sh
# Inject world-model awareness at session start.
# If a model exists, tell Claude it's available. One line, not a data dump.
# Claude decides when to query it.

MODEL="$(pwd)/.cartographer/model.json"

if [ ! -f "$MODEL" ]; then
  exit 0
fi

# Extract counts without loading the whole model into memory
python3 -c "
import json, sys
try:
    d = json.load(open('$MODEL'))
    entities = len(d.get('entities', []))
    rels = len(d.get('relationships', []))
    slices = len(d.get('slices', []))
    perspectives = [p for p in d.get('perspectives', []) if not p.get('isDefault')]

    if entities == 0:
        sys.exit(0)

    parts = [f'{entities} entities', f'{rels} relationships']
    if slices > 0:
        parts.append(f'{slices} behavior flows')
    if perspectives:
        parts.append(f'{len(perspectives)} perspectives')

    print(f'Cartographer world-model available for this project ({', '.join(parts)}). Use cartographer_query, cartographer_get_entity, and cartographer_get_summary to look up system boundaries, behavior flows, invariants, and failure points when answering questions about the codebase.')
except:
    pass
" 2>/dev/null
