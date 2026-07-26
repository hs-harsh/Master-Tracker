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

// ─── static exercise → muscle catalog ─────────────────────────────────────────
// Safety net so common gym / cardio / flexibility movements are never left
// untagged (or tagged with primaries only) when the AI parser is terse.
// Every entry lists a COMPLETE picture: primary movers AND assisting muscles.
//
// Matching (see catalogLookup): the name is normalised so punctuation and
// hyphens become spaces ("Push-Up" → "push up"), then keys are tried
// longest-first. Each key matches at a WORD boundary, never mid-word, in one of
// two modes:
//   • default "prefix" — leading boundary, free suffix, so 'row' hits "Rowing"
//     and 'walk' hits "Walking".
//   • word: true — leading AND trailing boundary (a plural "s" is allowed), for
//     short keys whose letters appear inside unrelated words ('spin' vs
//     "spinal", 'fly' vs "flyes").
// `unless` vetoes a match when any listed word appears in the name — this is
// what stops the generic 'curl' (biceps) key from claiming "Hamstring Curl".
// Longest-first ordering handles the rest: an explicit 'hamstring curl' entry
// always beats bare 'curl'.
const EXERCISE_CATALOG = {
  // ── cardio / machines ──
  'stepper':          { primary: ['quads', 'glutes'],          secondary: ['calves', 'hamstrings'] },
  'step mill':        { primary: ['quads', 'glutes'],          secondary: ['calves', 'hamstrings'] },
  'stair':            { primary: ['quads', 'glutes'],          secondary: ['calves', 'hamstrings'] },
  'treadmill':        { primary: ['quads', 'calves'],          secondary: ['hamstrings', 'glutes'] },
  'running':          { primary: ['quads', 'calves'],          secondary: ['hamstrings', 'glutes'] },
  'run':              { primary: ['quads', 'calves'],          secondary: ['hamstrings', 'glutes'], word: true },
  'sprint':           { primary: ['quads', 'hamstrings'],      secondary: ['glutes', 'calves', 'abs'] },
  'jog':              { primary: ['quads', 'calves'],          secondary: ['hamstrings', 'glutes'] },
  'walk':             { primary: ['quads', 'calves'],          secondary: ['glutes', 'hamstrings'] },
  'incline walk':     { primary: ['quads', 'glutes'],          secondary: ['calves', 'hamstrings'] },
  'cycling':          { primary: ['quads'],                    secondary: ['glutes', 'hamstrings', 'calves'] },
  'bike':             { primary: ['quads'],                    secondary: ['glutes', 'hamstrings', 'calves'] },
  'spin bike':        { primary: ['quads'],                    secondary: ['glutes', 'hamstrings', 'calves'] },
  'spinning':         { primary: ['quads'],                    secondary: ['glutes', 'hamstrings', 'calves'] },
  'spin class':       { primary: ['quads'],                    secondary: ['glutes', 'hamstrings', 'calves'] },
  'elliptical':       { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves'] },
  'cross trainer':    { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves'] },
  'rowing':           { primary: ['upper-back', 'lats', 'quads'], secondary: ['biceps', 'rear-delts', 'glutes', 'hamstrings', 'forearms'] },
  'rower':            { primary: ['upper-back', 'lats', 'quads'], secondary: ['biceps', 'rear-delts', 'glutes', 'hamstrings', 'forearms'] },
  'skipping':         { primary: ['calves'],                   secondary: ['quads', 'hamstrings', 'forearms'] },
  'skip rope':        { primary: ['calves'],                   secondary: ['quads', 'hamstrings', 'forearms'] },
  'jump rope':        { primary: ['calves'],                   secondary: ['quads', 'hamstrings', 'forearms'] },
  'jumprope':         { primary: ['calves'],                   secondary: ['quads', 'hamstrings', 'forearms'] },
  'burpee':           { primary: ['quads', 'chest'],           secondary: ['triceps', 'front-delts', 'abs', 'glutes', 'calves'] },
  'jumping jack':     { primary: ['calves', 'side-delts'],     secondary: ['quads', 'glutes'] },
  'mountain climber': { primary: ['abs', 'quads'],             secondary: ['obliques', 'front-delts'] },
  'swim':             { primary: ['lats', 'front-delts'],      secondary: ['upper-back', 'triceps', 'abs', 'glutes'] },
  'battle rope':      { primary: ['front-delts', 'forearms'],  secondary: ['side-delts', 'abs', 'upper-back'] },
  'sled':             { primary: ['quads', 'glutes'],          secondary: ['calves', 'hamstrings', 'abs'], word: true },
  'assault bike':     { primary: ['quads', 'front-delts'],     secondary: ['lats', 'glutes', 'hamstrings', 'calves'] },
  'air bike':         { primary: ['quads', 'front-delts'],     secondary: ['lats', 'glutes', 'hamstrings', 'calves'] },

  // ── legs ──
  'leg press':        { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves'] },
  'squat':            { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'lower-back', 'abs', 'calves'] },
  'hack squat':       { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves'] },
  'lunge':            { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves', 'abs'] },
  'step up':          { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves'] },
  'stepup':           { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves'] },
  'leg extension':    { primary: ['quads'],                    secondary: [] },
  'leg curl':         { primary: ['hamstrings'],               secondary: ['calves', 'glutes'] },
  'hamstring curl':   { primary: ['hamstrings'],               secondary: ['calves', 'glutes'] },
  'hamstrings curl':  { primary: ['hamstrings'],               secondary: ['calves', 'glutes'] },
  'legs curl':        { primary: ['hamstrings'],               secondary: ['calves', 'glutes'] },
  'prone curl':       { primary: ['hamstrings'],               secondary: ['calves', 'glutes'] },
  'glute curl':       { primary: ['hamstrings', 'glutes'],     secondary: ['calves'] },
  'nordic curl':      { primary: ['hamstrings'],               secondary: ['glutes', 'calves', 'abs'] },
  // bare 'nordic' catches "Nordics" / "Nordic Hamstring Curl". Nordic walking,
  // skiing and NordicTrack are different movements — vetoed here and given their
  // own keys below, so they never fall through to the leg-curl profile.
  'nordic':           { primary: ['hamstrings'],               secondary: ['glutes', 'calves', 'abs'],
                        unless: ['walk', 'walks', 'walking', 'ski', 'skis', 'skiing', 'track'] },
  'nordic walking':   { primary: ['quads', 'calves'],          secondary: ['glutes', 'hamstrings', 'upper-back', 'lats'] },
  'nordic walk':      { primary: ['quads', 'calves'],          secondary: ['glutes', 'hamstrings', 'upper-back', 'lats'] },
  'nordic ski':       { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves', 'lats', 'upper-back'] },
  'nordictrack':      { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves', 'upper-back'] },
  'glute ham raise':  { primary: ['hamstrings', 'glutes'],     secondary: ['lower-back', 'calves'] },
  'glute ham':        { primary: ['hamstrings', 'glutes'],     secondary: ['lower-back', 'calves'] },
  'romanian deadlift':{ primary: ['hamstrings', 'glutes'],     secondary: ['lower-back', 'upper-back', 'forearms'] },
  'stiff leg deadlift':{ primary: ['hamstrings', 'glutes'],    secondary: ['lower-back', 'upper-back', 'forearms'] },
  'dead lift':        { primary: ['hamstrings', 'glutes', 'lower-back'], secondary: ['quads', 'upper-back', 'lats', 'forearms', 'abs'] },
  'deadlift':         { primary: ['hamstrings', 'glutes', 'lower-back'], secondary: ['quads', 'upper-back', 'lats', 'forearms', 'abs'] },
  'hip thrust':       { primary: ['glutes'],                   secondary: ['hamstrings', 'quads', 'abs'] },
  'glute bridge':     { primary: ['glutes'],                   secondary: ['hamstrings', 'lower-back'] },
  'abduction':        { primary: ['glutes'],                   secondary: ['obliques'] },
  'adduction':        { primary: ['quads'],                    secondary: ['glutes'] },
  'calf raise':       { primary: ['calves'],                   secondary: ['hamstrings'] },

  // ── push ──
  'bench press':      { primary: ['chest'],                    secondary: ['triceps', 'front-delts'] },
  'incline press':    { primary: ['chest', 'front-delts'],     secondary: ['triceps'] },
  'chest press':      { primary: ['chest'],                    secondary: ['triceps', 'front-delts'] },
  'push up':          { primary: ['chest'],                    secondary: ['triceps', 'front-delts', 'abs'] },
  'pushup':           { primary: ['chest'],                    secondary: ['triceps', 'front-delts', 'abs'] },
  'chest fly':        { primary: ['chest'],                    secondary: ['front-delts'] },
  'fly':              { primary: ['chest'],                    secondary: ['front-delts'], word: true, unless: ['reverse', 'rear'] },
  'reverse fly':      { primary: ['rear-delts'],               secondary: ['upper-back'] },
  'pec deck':         { primary: ['chest'],                    secondary: ['front-delts'] },
  'dip':              { primary: ['chest', 'triceps'],         secondary: ['front-delts'], word: true },
  'shoulder press':   { primary: ['front-delts'],              secondary: ['side-delts', 'triceps', 'upper-back'] },
  'overhead press':   { primary: ['front-delts'],              secondary: ['side-delts', 'triceps', 'abs'] },
  'military press':   { primary: ['front-delts'],              secondary: ['side-delts', 'triceps', 'abs'] },
  'arnold press':     { primary: ['front-delts', 'side-delts'],secondary: ['triceps', 'upper-back'] },
  'lateral raise':    { primary: ['side-delts'],               secondary: ['rear-delts', 'upper-back'] },
  'lat raise':        { primary: ['side-delts'],               secondary: ['rear-delts', 'upper-back'] },
  'front raise':      { primary: ['front-delts'],              secondary: ['side-delts', 'chest'] },
  'rear delt':        { primary: ['rear-delts'],               secondary: ['upper-back'] },
  'tricep':           { primary: ['triceps'],                  secondary: ['front-delts', 'forearms'] },
  'skull crusher':    { primary: ['triceps'],                  secondary: ['forearms'] },

  // ── pull ──
  'lat pulldown':     { primary: ['lats'],                     secondary: ['upper-back', 'biceps', 'rear-delts', 'forearms'] },
  'lat pull down':    { primary: ['lats'],                     secondary: ['upper-back', 'biceps', 'rear-delts', 'forearms'] },
  'pulldown':         { primary: ['lats'],                     secondary: ['upper-back', 'biceps', 'rear-delts', 'forearms'] },
  'pull down':        { primary: ['lats'],                     secondary: ['upper-back', 'biceps', 'rear-delts', 'forearms'] },
  'pull up':          { primary: ['lats'],                     secondary: ['upper-back', 'biceps', 'forearms', 'abs'] },
  'pullup':           { primary: ['lats'],                     secondary: ['upper-back', 'biceps', 'forearms', 'abs'] },
  'chin up':          { primary: ['lats', 'biceps'],           secondary: ['upper-back', 'forearms'] },
  'chinup':           { primary: ['lats', 'biceps'],           secondary: ['upper-back', 'forearms'] },
  'row':              { primary: ['upper-back', 'lats'],       secondary: ['biceps', 'rear-delts', 'forearms', 'lower-back'] },
  'upright row':      { primary: ['side-delts', 'upper-back'], secondary: ['biceps', 'rear-delts', 'forearms'] },
  'shrug':            { primary: ['upper-back'],               secondary: ['forearms', 'side-delts'] },
  'face pull':        { primary: ['rear-delts'],               secondary: ['upper-back', 'biceps'] },
  'bicep':            { primary: ['biceps'],                   secondary: ['forearms', 'front-delts'] },
  'hammer curl':      { primary: ['biceps', 'forearms'],       secondary: ['front-delts'] },
  'preacher curl':    { primary: ['biceps'],                   secondary: ['forearms'] },
  // Generic 'curl' means a biceps curl ONLY when no leg/hamstring qualifier is
  // present — otherwise "Hamstring Curl" would credit biceps.
  'curl':             { primary: ['biceps'],                   secondary: ['forearms'],
                        unless: ['leg', 'legs', 'hamstring', 'hamstrings', 'nordic', 'nordics',
                                 'glute', 'glutes', 'prone'] },

  // ── core ──
  'crunch':           { primary: ['abs'],                      secondary: ['obliques'] },
  'sit up':           { primary: ['abs'],                      secondary: ['obliques', 'quads'] },
  'situp':            { primary: ['abs'],                      secondary: ['obliques', 'quads'] },
  'v up':             { primary: ['abs'],                      secondary: ['obliques', 'quads'], word: true },
  'plank':            { primary: ['abs'],                      secondary: ['obliques', 'lower-back', 'front-delts', 'glutes'] },
  'leg raise':        { primary: ['abs'],                      secondary: ['obliques', 'quads'] },
  'russian twist':    { primary: ['obliques'],                 secondary: ['abs'] },
  'side plank':       { primary: ['obliques'],                 secondary: ['abs', 'side-delts', 'glutes'] },
  'back extension':   { primary: ['lower-back'],               secondary: ['glutes', 'hamstrings'] },
  'hyperextension':   { primary: ['lower-back'],               secondary: ['glutes', 'hamstrings'] },
  'hyper extension':  { primary: ['lower-back'],               secondary: ['glutes', 'hamstrings'] },
  'wrist':            { primary: ['forearms'],                 secondary: ['biceps'] },
  'farmer':           { primary: ['forearms', 'upper-back'],   secondary: ['abs', 'quads', 'calves'] },

  // ── flexibility / yoga ──
  'hamstring stretch':{ primary: ['hamstrings'],               secondary: ['calves', 'lower-back'] },
  'quad stretch':     { primary: ['quads'],                    secondary: ['glutes'] },
  'calf stretch':     { primary: ['calves'],                   secondary: ['hamstrings'] },
  'hip flexor stretch':{ primary: ['quads'],                   secondary: ['glutes', 'abs'] },
  'glute stretch':    { primary: ['glutes'],                   secondary: ['hamstrings', 'lower-back'] },
  'chest stretch':    { primary: ['chest'],                    secondary: ['front-delts'] },
  'doorway stretch':  { primary: ['chest'],                    secondary: ['front-delts'] },
  'shoulder stretch': { primary: ['front-delts'],              secondary: ['side-delts', 'upper-back'] },
  'lat stretch':      { primary: ['lats'],                      secondary: ['upper-back'] },
  'spine stretch':    { primary: ['lower-back'],               secondary: ['upper-back', 'obliques'] },
  'spinal twist':     { primary: ['obliques'],                 secondary: ['lower-back', 'upper-back'] },
  'spine twist':      { primary: ['obliques'],                 secondary: ['lower-back', 'upper-back'] },
  'spinal':           { primary: ['obliques'],                 secondary: ['lower-back', 'upper-back'] },
  'forward fold':     { primary: ['hamstrings'],               secondary: ['lower-back', 'calves'] },
  'butterfly stretch':{ primary: ['quads'],                    secondary: ['glutes'] },
  'cat cow':          { primary: ['lower-back'],               secondary: ['abs', 'upper-back'] },
  'downward dog':     { primary: ['hamstrings', 'calves'],     secondary: ['lats', 'front-delts', 'upper-back'] },
  'downward facing dog':{ primary: ['hamstrings', 'calves'],   secondary: ['lats', 'front-delts', 'upper-back'] },
  'child pose':       { primary: ['lower-back'],               secondary: ['lats', 'glutes'] },
  'childs pose':      { primary: ['lower-back'],               secondary: ['lats', 'glutes'] },
  'cobra':            { primary: ['lower-back'],               secondary: ['abs', 'chest'] },
  'pigeon':           { primary: ['glutes'],                   secondary: ['hamstrings', 'lower-back'] },
  'warrior':          { primary: ['quads', 'glutes'],          secondary: ['hamstrings', 'calves', 'side-delts'] },
  'yoga':             { primary: ['abs', 'lower-back', 'hamstrings'], secondary: ['quads', 'glutes', 'front-delts', 'upper-back', 'calves'] },
};

// Normalise a name for matching: lowercase, every run of non-alphanumerics
// becomes a single space (so "Push-Up", "Farmer's Walk", "Fly (Cable)" all
// tokenise cleanly), wrapped in spaces so leading/trailing boundaries are
// simple string checks.
function normName(name) {
  return ' ' + String(name || '')
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')          // drop apostrophes so "Child's" → "childs"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() + ' ';
}

function hasWord(norm, word) {
  return norm.includes(' ' + word + ' ');
}

function keyMatches(key, entry, norm) {
  if (entry.unless && entry.unless.some(w => hasWord(norm, w))) return false;
  const k = key.replace(/[^a-z0-9]+/g, ' ');
  const at = norm.indexOf(' ' + k);            // leading word boundary
  if (at === -1) return false;
  if (!entry.word) return true;                // free suffix: 'row' → "rowing"
  const rest = norm.slice(at + 1 + k.length);  // exact token (+ optional plural)
  return rest.startsWith(' ') || rest.startsWith('s ') || rest.startsWith('es ');
}

// Longest keys first so 'hamstring curl' wins over 'curl', 'romanian deadlift'
// over 'deadlift', 'side plank' over 'plank', etc.
const CATALOG_KEYS = Object.keys(EXERCISE_CATALOG)
  .sort((a, b) => b.length - a.length || a.localeCompare(b));

function catalogLookup(name) {
  const norm = normName(name);
  if (norm === '  ') return null;
  for (const key of CATALOG_KEYS) {
    if (keyMatches(key, EXERCISE_CATALOG[key], norm)) return EXERCISE_CATALOG[key];
  }
  return null;
}

// Merge the catalog into an exercise's muscle list: adds anything the AI missed,
// and upgrades a muscle to primary when the catalog says it is a primary mover.
// AI-supplied muscles that the catalog doesn't know about are preserved.
function completeMuscles(name, muscles) {
  const cat = catalogLookup(name);
  const out = validateMuscles(muscles);
  if (!cat) return out;
  const byId = new Map(out.map(m => [m.muscle, m]));
  for (const id of cat.primary || []) {
    if (!MUSCLE_ID_SET.has(id)) continue;
    const cur = byId.get(id);
    if (cur) cur.role = 'primary';
    else { const m = { muscle: id, role: 'primary' }; byId.set(id, m); out.push(m); }
  }
  for (const id of cat.secondary || []) {
    if (!MUSCLE_ID_SET.has(id) || byId.has(id)) continue;
    const m = { muscle: id, role: 'secondary' };
    byId.set(id, m);
    out.push(m);
  }
  return out;
}

// Fill in muscle tags from the static catalog for AI-parsed exercises.
// Applied ONLY on the ai-log parse path — never on user edits, so a user who
// deliberately removes a muscle chip does not get it silently re-added.
function completeExerciseMuscles(exercises) {
  return (Array.isArray(exercises) ? exercises : [])
    .map(ex => ({ ...ex, muscles: completeMuscles(ex.name, ex.muscles) }));
}

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
          // NOTE: the per-set `note` key was retired from the UI and is no
          // longer written. Old rows may still carry it in the sets JSONB and
          // are read back fine — we simply drop it on the next save.
          return {
            set: j + 1,
            weight_kg: weightKg,
            weight_raw: s?.weight_raw != null ? String(s.weight_raw).slice(0, 50) : (weightKg != null ? String(weightKg) : null),
            reps,
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

module.exports = {
  MUSCLE_GROUPS, MUSCLE_IDS, MUSCLE_ID_SET, muscleLabel,
  validateMuscles, validateExercises, CATEGORIES,
  EXERCISE_CATALOG, catalogLookup, completeMuscles, completeExerciseMuscles,
};
