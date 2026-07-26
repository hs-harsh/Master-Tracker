// Regression guard for the static exercise → muscle catalog in muscles.js.
//
// Run with `npm test` from server/ (uses Node's built-in test runner — no deps).
//
// WHY THIS FILE EXISTS: catalogLookup matches catalog keys against free-text
// exercise names coming out of the AI parser. Two separate rounds of QA found
// silent mis-tagging bugs caused by short keys matching names they had no
// business claiming — most seriously the generic 'curl' (biceps) key swallowing
// "Hamstring Curl", which credited biceps for leg work on the body map, in the
// trends chart, and in recommend-next's recency data.
//
// The failure mode is quiet: nothing throws, the numbers are just wrong. So
// every collision found gets locked in here. When you add a catalog key, add
// cases for it — especially if the key is short or a common English word.

const { test } = require('node:test');
const assert = require('node:assert');
const { catalogLookup, EXERCISE_CATALOG, MUSCLE_ID_SET } = require('./muscles');

// [name, mustIncludePrimary, mustNotIncludeAnyRole?]
const EXPECTED = [
  // ── the biceps/hamstrings collision class (round 1 + round 2 QA) ──────────
  // Generic 'curl' must never claim a leg-curl variant.
  ['Hamstring Curl',            'hamstrings', ['biceps']],
  ['Hamstrings Curl',           'hamstrings', ['biceps']],
  ['Standing Hamstring Curl',   'hamstrings', ['biceps']],
  ['Nordic Curl',               'hamstrings', ['biceps']],
  ['Nordic Hamstring Curl',     'hamstrings', ['biceps']],
  ['Nordics',                   'hamstrings', ['biceps']],
  ['Leg Curl',                  'hamstrings', ['biceps']],
  ['Legs Curl',                 'hamstrings', ['biceps']],
  ['Lying Leg Curl',            'hamstrings', ['biceps']],
  ['Seated Leg Curl',           'hamstrings', ['biceps']],
  ['Prone Curl',                'hamstrings', ['biceps']],
  ['Glute Curl',                'hamstrings', ['biceps']],
  ['Glute Ham Curl',            'hamstrings', ['biceps']],
  ['Glute Ham Raise',           'hamstrings', ['biceps']],
  // ...but a real biceps curl still resolves to biceps.
  ['Bicep Curl',                'biceps'],
  ['Barbell Curl',              'biceps'],
  ['Concentration Curl',        'biceps'],
  ['EZ Bar Curl',               'biceps'],
  ['Incline Dumbbell Curl',     'biceps'],
  ['Preacher Curl',             'biceps'],
  // 'hammer' must not trip the 'ham' veto (vetoes are word-matched, not substring).
  ['Hammer Curl',               'biceps'],
  ['Wrist Curl',                'forearms'],
  ['Reverse Wrist Curl',        'forearms'],

  // ── hyphen / possessive / plural normalisation ───────────────────────────
  ['Push-Up',                   'chest'],
  ['Push-Ups',                  'chest'],
  ['Pushups',                   'chest'],
  ['Pull-Up',                   'lats'],
  ['Wide-Grip Pull-Up',         'lats'],
  ['Chin-Up',                   'lats'],
  ['Sit-Up',                    'abs'],
  ['Sit-Ups',                   'abs'],
  ['Step-Up',                   'quads'],
  ['Box Step-Ups',              'quads'],
  ['Jump-Rope',                 'calves'],
  ['V-Ups',                     'abs'],
  ['Cat-Cow',                   'lower-back'],
  ["Child's Pose",              'lower-back'],   // apostrophe must be stripped, not spaced
  ['Childs Pose',               'lower-back'],
  ["Farmer's Walk",             'forearms'],
  ['Farmers Walk',              'forearms'],
  ['Dumbbell Flyes',            'chest'],        // 'es' plural
  ['Dumbbell Flys',             'chest'],
  ['Side Planks',               'obliques'],
  ['Russian Twists',            'obliques'],
  ['Hyperextensions',           'lower-back'],
  ['Calf Raises',               'calves'],

  // ── separated vs joined machine names ────────────────────────────────────
  ['Lat Pulldown',              'lats'],
  ['Lat Pull-Down',             'lats'],
  ['Lat Pull Down',             'lats'],
  ['Pulldown',                  'lats'],
  ['Pull Down',                 'lats'],
  ['Hyper Extension',           'lower-back'],
  ['Dead Lift',                 'hamstrings'],
  ['Deadlift',                  'hamstrings'],
  ['Romanian Deadlift',         'hamstrings'],
  ['Stiff Leg Deadlift',        'hamstrings'],

  // ── spin / spine confusion ───────────────────────────────────────────────
  ['Spinal Twist',              'obliques', ['quads']],
  ['Spine Twist',               'obliques', ['quads']],
  ['Spine Stretch',             'lower-back', ['quads']],
  ['Thoracic Spine Stretch',    'lower-back', ['quads']],
  ['Spinal Rotation',           'obliques', ['quads']],
  ['Spin Bike',                 'quads'],
  ['Spinning',                  'quads'],
  ['Spin Class',                'quads'],

  // ── cardio / machines ────────────────────────────────────────────────────
  ['Steppers',                  'quads'],
  ['Stair Climber',             'quads'],
  ['Stairmaster',               'quads'],
  ['Treadmill',                 'quads'],
  ['Incline Treadmill Walk',    'quads'],
  ['Walking',                   'quads'],
  ['Running',                   'quads'],
  ['Sprints',                   'quads'],
  ['Stationary Bike',           'quads'],
  ['Assault Bike Sprints',      'quads'],
  ['Elliptical Trainer',        'quads'],
  ['Rowing Machine',            'upper-back'],
  ['Rowing Erg',                'upper-back'],
  ['Jumping Jacks',             'calves'],
  ['Swimming Laps',             'lats'],
  ['Mountain Climbers',         'abs'],
  // Bare 'nordic' is a hamstring curl, whose primary is hamstrings only — so
  // asserting quads as primary proves each of these beat it.
  ['Nordic Walking',            'quads', ['biceps']],
  ['Nordic Walk',               'quads', ['biceps']],
  ['Nordic Ski',                'quads', ['biceps']],
  ['Nordic Skiing',             'quads', ['biceps']],
  ['NordicTrack',               'quads', ['biceps']],
  ['Sled Push',                 'quads'],
  ['Sleds',                     'quads'],

  // ── strength ─────────────────────────────────────────────────────────────
  ['Bulgarian Split Squat',     'quads'],
  ['Goblet Squat',              'quads'],
  ['Hack Squat Machine',        'quads'],
  ['Walking Lunge',             'quads'],
  ['Leg Press',                 'quads'],
  ['Leg Extension',             'quads'],
  ['Hip Abduction Machine',     'glutes'],
  ['Incline Bench Press',       'chest'],
  ['Seated Shoulder Press',     'front-delts'],
  ['Arnold Press',              'front-delts'],
  ['Cable Lateral Raises',      'side-delts'],
  ['Lat Raise',                 'side-delts'],
  ['Seated Cable Row',          'upper-back'],
  ['Single-Arm Dumbbell Row',   'upper-back'],
  ['Inverted Row',              'upper-back'],
  ['Upright Row',               'side-delts'],
  ['Bench Dips',                'triceps'],
  ['Ring Dips',                 'chest'],
  ['Rear Delt Fly',             'rear-delts'],
  ['Reverse Fly',               'rear-delts'],
  ['Cable Fly',                 'chest'],
  ['Bicycle Crunch',            'abs'],
  ['Cable Crunches',            'abs'],
  ['Hanging Leg Raises',        'abs'],
  ['Plank Hold',                'abs'],

  // ── flexibility / yoga ───────────────────────────────────────────────────
  ['Hamstring Stretch',         'hamstrings'],
  ['Standing Quad Stretch',     'quads'],
  ['Calf Stretch',              'calves'],
  ['Hip Flexor Stretch',        'quads'],
  ['Doorway Chest Stretch',     'chest'],
  ['Lat Stretch',               'lats'],
  ['Seated Forward Fold',       'hamstrings'],
  ['Butterfly Stretch',         'quads'],
  ['Pigeon Pose',               'glutes'],
  ['Warrior II',                'quads'],
  ['Cobra Pose',                'lower-back'],
  ['Downward Dog',              'hamstrings'],
  ['Downward Facing Dog',       'hamstrings'],
  ['Yoga Flow',                 'abs'],
];

// Names that must NOT match any key. These are the mid-word hazards: words that
// contain a short catalog key as a substring but are unrelated movements. If one
// of these starts matching, a key needs `word: true` or an `unless` veto.
const MUST_NOT_MATCH = [
  'Narrow Stance Hold',   // contains 'row'
  'Eyebrow Raise',        // contains 'row'
  'Sledgehammer Swing',   // contains 'sled'
  'Flying Kick',          // contains 'fly'
  'Runner Highs',         // 'run' must be word-mode, not a prefix of "runner"
  'Sidewalk Shuffle',     // contains 'walk'
  'Spinach Lift',         // contains 'spin'
  'Dipper Hold',          // contains 'dip' — prefix mode, but not as first word
  // No explicit key matches this phrasing, so the generic 'curl' veto is the ONLY
  // thing stopping it from being tagged biceps. Keep it here: without this case
  // the veto list could be emptied and the suite would still pass.
  'Leg Machine Curl',
];

test('every catalogued name resolves to the expected primary muscle', () => {
  for (const [name, mustInclude, mustNotInclude] of EXPECTED) {
    const hit = catalogLookup(name);
    assert.ok(hit, `"${name}" matched no catalog key (silent untagged fallthrough)`);
    assert.ok(
      hit.primary.includes(mustInclude),
      `"${name}" expected primary to include "${mustInclude}", got primary=[${hit.primary}]`
    );
    for (const banned of mustNotInclude || []) {
      const all = [...hit.primary, ...(hit.secondary || [])];
      assert.ok(
        !all.includes(banned),
        `"${name}" must not credit "${banned}" at all, got [${all}]`
      );
    }
  }
});

test('mid-word hazards do not match any catalog key', () => {
  for (const name of MUST_NOT_MATCH) {
    const hit = catalogLookup(name);
    assert.strictEqual(
      hit, null,
      `"${name}" wrongly matched a catalog key → primary=[${hit && hit.primary}]`
    );
  }
});

test('every catalog entry is well-formed and uses only real muscle ids', () => {
  for (const [key, entry] of Object.entries(EXERCISE_CATALOG)) {
    assert.ok(Array.isArray(entry.primary) && entry.primary.length > 0,
      `"${key}" must list at least one primary muscle`);
    for (const id of [...entry.primary, ...(entry.secondary || [])]) {
      assert.ok(MUSCLE_ID_SET.has(id), `"${key}" references unknown muscle id "${id}"`);
    }
    const all = [...entry.primary, ...(entry.secondary || [])];
    assert.strictEqual(new Set(all).size, all.length,
      `"${key}" lists a muscle twice (primary and secondary)`);
    assert.ok(key === key.toLowerCase(), `"${key}" must be lowercase to ever match`);
  }
});

test('catalogLookup is null-safe on junk input', () => {
  for (const junk of [null, undefined, '', '   ', 123, {}, '---']) {
    assert.doesNotThrow(() => catalogLookup(junk), `threw on ${JSON.stringify(junk)}`);
  }
});
