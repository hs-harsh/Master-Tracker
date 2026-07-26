// Mirror of server/utils/muscles.js — keep both in sync.
export const MUSCLE_GROUPS = [
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

export const MUSCLE_IDS = MUSCLE_GROUPS.map(m => m.id);

export function muscleLabel(id) {
  const m = MUSCLE_GROUPS.find(g => g.id === id);
  return m ? m.label : id;
}
