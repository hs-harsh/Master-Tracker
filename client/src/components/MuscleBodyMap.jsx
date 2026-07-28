import { muscleLabel } from '../lib/muscles';

// Schematic front/back body figures. One shape-group per muscle in the enum.
// Tint = var(--accent) with opacity proportional to score/10 (floor 0.15 when
// trained); untrained muscles are outlined only.

const FRONT_SHAPES = {
  'front-delts': [
    { type: 'ellipse', cx: 63,  cy: 80,  rx: 10, ry: 9 },
    { type: 'ellipse', cx: 137, cy: 80,  rx: 10, ry: 9 },
  ],
  'side-delts': [
    { type: 'ellipse', cx: 51,  cy: 88,  rx: 6,  ry: 11 },
    { type: 'ellipse', cx: 149, cy: 88,  rx: 6,  ry: 11 },
  ],
  chest: [
    { type: 'ellipse', cx: 82,  cy: 100, rx: 16, ry: 12 },
    { type: 'ellipse', cx: 118, cy: 100, rx: 16, ry: 12 },
  ],
  biceps: [
    { type: 'ellipse', cx: 52,  cy: 122, rx: 8,  ry: 16 },
    { type: 'ellipse', cx: 148, cy: 122, rx: 8,  ry: 16 },
  ],
  forearms: [
    { type: 'ellipse', cx: 45,  cy: 160, rx: 7,  ry: 18 },
    { type: 'ellipse', cx: 155, cy: 160, rx: 7,  ry: 18 },
  ],
  abs: [
    { type: 'rect', x: 88, y: 116, width: 24, height: 52, rx: 8 },
  ],
  obliques: [
    { type: 'rect', x: 74,  y: 122, width: 10, height: 40, rx: 5 },
    { type: 'rect', x: 116, y: 122, width: 10, height: 40, rx: 5 },
  ],
  quads: [
    { type: 'ellipse', cx: 83,  cy: 218, rx: 13, ry: 36 },
    { type: 'ellipse', cx: 117, cy: 218, rx: 13, ry: 36 },
  ],
};

const BACK_SHAPES = {
  'rear-delts': [
    { type: 'ellipse', cx: 63,  cy: 80,  rx: 10, ry: 9 },
    { type: 'ellipse', cx: 137, cy: 80,  rx: 10, ry: 9 },
  ],
  'upper-back': [
    { type: 'polygon', points: '100,64 74,82 100,112 126,82' },
  ],
  lats: [
    { type: 'polygon', points: '72,96 92,104 92,148 78,132' },
    { type: 'polygon', points: '128,96 108,104 108,148 122,132' },
  ],
  triceps: [
    { type: 'ellipse', cx: 52,  cy: 122, rx: 8,  ry: 16 },
    { type: 'ellipse', cx: 148, cy: 122, rx: 8,  ry: 16 },
  ],
  forearms: [
    { type: 'ellipse', cx: 45,  cy: 160, rx: 7,  ry: 18 },
    { type: 'ellipse', cx: 155, cy: 160, rx: 7,  ry: 18 },
  ],
  'lower-back': [
    { type: 'rect', x: 89, y: 138, width: 22, height: 30, rx: 6 },
  ],
  glutes: [
    { type: 'ellipse', cx: 86,  cy: 186, rx: 14, ry: 14 },
    { type: 'ellipse', cx: 114, cy: 186, rx: 14, ry: 14 },
  ],
  hamstrings: [
    { type: 'ellipse', cx: 83,  cy: 236, rx: 12, ry: 32 },
    { type: 'ellipse', cx: 117, cy: 236, rx: 12, ry: 32 },
  ],
  calves: [
    { type: 'ellipse', cx: 84,  cy: 302, rx: 9,  ry: 24 },
    { type: 'ellipse', cx: 116, cy: 302, rx: 9,  ry: 24 },
  ],
};

function Shape({ def, ...props }) {
  if (def.type === 'ellipse') return <ellipse cx={def.cx} cy={def.cy} rx={def.rx} ry={def.ry} {...props} />;
  if (def.type === 'rect')    return <rect x={def.x} y={def.y} width={def.width} height={def.height} rx={def.rx} {...props} />;
  if (def.type === 'polygon') return <polygon points={def.points} {...props} />;
  return null;
}

function Figure({ title, shapes, muscles, selected, onSelect }) {
  return (
    <div className="flex-1 min-w-0 text-center">
      <svg viewBox="0 0 200 345" className="w-full max-w-[220px] mx-auto" role="img" aria-label={`${title} muscle map`}>
        {/* faint body silhouette for context */}
        <g stroke="currentColor" strokeOpacity="0.18" fill="none" strokeWidth="1.5" className="text-soft">
          <circle cx="100" cy="34" r="17" />
          <path d="M83 55 C 62 62, 50 74, 47 100 L 42 178 M117 55 C 138 62, 150 74, 153 100 L 158 178
                   M72 62 C 68 110, 70 150, 74 176 L 72 250 L 76 335 M128 62 C 132 110, 130 150, 126 176 L 128 250 L 124 335
                   M74 176 L 126 176" />
        </g>
        {Object.entries(shapes).map(([id, defs]) => {
          const info = muscles?.[id];
          const score = info?.score || 0;
          const trained = score > 0;
          // Worked by cardio/stretching only: no scored sets, but saying
          // "not trained" would contradict the detail panel below.
          const cardioOnly = !trained && info?.exercises?.length > 0;
          const opacity = trained ? Math.max(0.15, score / 10) : 0;
          const isSel = selected === id;
          return (
            <g key={id}
              onClick={() => onSelect(id)}
              className="cursor-pointer"
              style={{ pointerEvents: 'all' }}>
              <title>{`${muscleLabel(id)}${
                trained ? ` — ${score}/10`
                  : cardioOnly ? ' — cardio/stretching only, no scored sets'
                  : ' — not trained'
              }`}</title>
              {defs.map((def, i) => (
                <Shape key={i} def={def}
                  fill={trained ? 'var(--accent)' : 'transparent'}
                  fillOpacity={opacity}
                  stroke={isSel ? 'var(--accent-ink)' : 'currentColor'}
                  strokeOpacity={isSel ? 1 : (trained ? 0.55 : 0.3)}
                  strokeWidth={isSel ? 2 : 1}
                  className="text-soft transition-all"
                />
              ))}
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-muted uppercase tracking-widest font-mono mt-1">{title}</p>
    </div>
  );
}

export default function MuscleBodyMap({ muscles, selected, onSelect }) {
  const detail = selected ? muscles?.[selected] : null;
  // de-duplicate exercise rows (same exercise may hit a muscle as primary+secondary)
  const detailExercises = [];
  if (detail?.exercises?.length) {
    const seen = new Set();
    for (const ex of detail.exercises) {
      const key = `${ex.name}|${ex.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      detailExercises.push(ex);
    }
  }

  return (
    <div className="card p-4">
      <p className="text-xs text-muted uppercase tracking-widest font-mono mb-1">Muscles trained this week</p>
      <p className="text-[10px] text-muted/60 font-mono mb-3">
        Score out of 10 = sets worked · primary set = 1 · secondary set = 0.25
      </p>
      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start justify-center">
        <Figure title="Front" shapes={FRONT_SHAPES} muscles={muscles} selected={selected} onSelect={onSelect} />
        <Figure title="Back"  shapes={BACK_SHAPES}  muscles={muscles} selected={selected} onSelect={onSelect} />
      </div>

      {selected && (
        <div className="mt-4 rounded-xl border border-hairline/8 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-white text-sm font-semibold font-body">{muscleLabel(selected)}</p>
            {detail && detail.score > 0 ? (
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent-ink border border-accent/30">
                {detail.score}/10 · {detail.sets} sets
              </span>
            ) : detailExercises.length > 0 ? (
              <span className="text-xs font-mono text-muted">0/10 · Cardio/stretching only, no scored sets</span>
            ) : (
              <span className="text-xs font-mono text-muted">0/10 · Not trained this week</span>
            )}
          </div>
          {detailExercises.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {detailExercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-soft truncate">
                    {ex.name}
                    {ex.role === 'secondary' && <span className="ml-1 text-[9px] font-mono text-muted">2°</span>}
                  </span>
                  <span className="text-muted font-mono shrink-0">
                    {new Date(ex.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {ex.sets ? ` · ${ex.sets} sets` : (ex.duration_min ? ` · ${ex.duration_min} min` : '')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!selected && (
        <p className="text-[11px] text-muted/70 text-center mt-3">Tap a muscle to see what trained it this week.</p>
      )}
    </div>
  );
}
