// Canonical muscle-group enum for workout exercise logs.
// Mirrored on the client in client/src/lib/muscles.js — keep both in sync.
const MUSCLE_GROUPS = [
  { id: 'chest',       label: 'Chest' },
  { id: 'upper-back',  label: 'Upper Back' },
  { id: 'lats',        label: 'Lats' },
  { id: 'front-delts', label: 'Front Delts' },
  { id: 'side-delts',  label: 'Side Delts' },
  { id: 'rear-delts',  label: 'Rear Delts' },
  { id: 'biceps',      label: 'Biceps' },
  { id: 'triceps',     label: 'Triceps' },
  { id: 'forearms',    label: 'Forearms' },
  { id: 'abs',         label: 'Abs' },
  { id: 'obliques',    label: 'Obliques' },
  { id: 'lower-back',  label: 'Lower Back' },
  { id: 'quads',       label: 'Quads' },
  { id: 'hamstrings',  label: 'Hamstrings' },
  { id: 'glutes',      label: 'Glutes' },
  { id: 'calves',      label: 'Calves' },
];

const MUSCLE_IDS = MUSCLE_GROUPS.map(m => m.id);
const MUSCLE_ID_SET = new Set(MUSCLE_IDS);

function muscleLabel(id) {
  const m = MUSCLE_GROUPS.find(g => g.id === id);
  return m ? m.label : id;
}

// Validate/normalise a muscles array from AI output: keep only enum muscles
// with a valid role; drop everything else.
function validateMuscles(muscles) {
  if (!Array.isArray(muscles)) return [];
  const out = [];
  const seen = new Set();
  for (const m of muscles) {
    const id = String(m?.muscle || '').toLowerCase().trim();
    const role = m?.role === 'secondary' ? 'secondary' : 'primary';
    if (!MUSCLE_ID_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ muscle: id, role });
  }
  return out;
}

const CATEGORIES = ['strength', 'cardio', 'flexibility'];

// Validate/normalise a full exercises array from AI output or client edits.
function validateExercises(exercises) {
  if (!Array.isArray(exercises)) return [];
  return exercises
    .filter(ex => ex && String(ex.name || '').trim())
    .map((ex, i) => {
      const category = CATEGORIES.includes(ex.category) ? ex.category : 'strength';
      const sets = (Array.isArray(ex.sets) ? ex.sets : [])
        .map((s, j) => {
          const weightKg = s?.weight_kg != null && isFinite(Number(s.weight_kg)) ? Number(s.weight_kg) : null;
          const reps = s?.reps != null && isFinite(parseInt(s.reps, 10)) ? parseInt(s.reps, 10) : null;
          return {
            set: j + 1,
            weight_kg: weightKg,
            weight_raw: s?.weight_raw != null ? String(s.weight_raw).slice(0, 50) : (weightKg != null ? String(weightKg) : null),
            reps,
            note: s?.note ? String(s.note).slice(0, 120) : null,
          };
        });
      const durationMin = ex.duration_min != null && isFinite(parseInt(ex.duration_min, 10))
        ? parseInt(ex.duration_min, 10) : null;
      return {
        seq: i,
        name: String(ex.name).trim().slice(0, 255),
        category,
        muscles: validateMuscles(ex.muscles),
        sets,
        duration_min: durationMin,
      };
    });
}

module.exports = { MUSCLE_GROUPS, MUSCLE_IDS, MUSCLE_ID_SET, muscleLabel, validateMuscles, validateExercises, CATEGORIES };
