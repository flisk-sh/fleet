// One real run of the agent race, recorded on fleet.flisk.si on 2026-11-12 with real pods on four providers.
// The public /demo page plays it back at its real speed, so anyone can watch the race without signing in.
// Pod ids are left out. Steps are [kind, name, startMs, endMs, ok, detail, test lines].
const job = (id, title, provider, steps) => ({
  id,
  title,
  provider,
  ok: true,
  fixed: steps.some((s) => s[0] === 'fix'),
  startMs: 0,
  endMs: steps.at(-1)[3],
  steps: steps.map(([kind, name, startMs, endMs, ok, detail, output]) => ({ kind, name, startMs, endMs, ok, detail, ...(output ? { output } : {}) })),
});

const jobs = [
  job('slugify', 'Add a slugify helper', 'daytona', [
    ['start', 'Start a pod', 0, 4728, true, 'daytona'],
    ['write', 'Write the code and tests', 4728, 6016, true, 'slug.py, test_slug.py'],
    ['test', 'Run the tests', 6016, 6589, true, '2 passed', ['test_punctuation ok', 'test_words ok']],
    ['stop', 'Stop the pod', 6589, 6720, true, ''],
  ]),
  job('duration', 'Parse "1h30m" into seconds', 'blaxel', [
    ['start', 'Start a pod', 0, 409, true, 'blaxel'],
    ['write', 'Write the code and tests', 409, 595, true, 'duration.py, test_duration.py'],
    ['test', 'Run the tests', 595, 736, true, '2 passed', ['test_hours_minutes ok', 'test_seconds_only ok']],
    ['stop', 'Stop the pod', 736, 826, true, ''],
  ]),
  job('wordcount', 'Count words in a text', 'upstash', [
    ['start', 'Start a pod', 0, 700, true, 'upstash'],
    ['write', 'Write the code and tests', 700, 982, true, 'words.py, test_words.py'],
    ['test', 'Run the tests', 982, 1349, false, '1 of 2 failed', ['test_extra_spaces FAIL', 'test_simple ok']],
    ['fix', 'Write the fix', 1349, 1498, true, 'words.py'],
    ['test', 'Run the tests again', 1498, 1868, true, '2 passed', ['test_extra_spaces ok', 'test_simple ok']],
    ['stop', 'Stop the pod', 1868, 2221, true, ''],
  ]),
  job('roman', 'Turn numbers into Roman numerals', 'vercel', [
    ['start', 'Start a pod', 0, 349, true, 'vercel'],
    ['write', 'Write the code and tests', 349, 744, true, 'roman.py, test_roman.py'],
    ['test', 'Run the tests', 744, 1103, true, '2 passed', ['test_four ok', 'test_year ok']],
    ['stop', 'Stop the pod', 1103, 1346, true, ''],
  ]),
];

export const RECORDED = {
  recordedOn: '2026-11-12',
  ok: true,
  passed: 4,
  fixed: 1,
  total: 4,
  totalMs: 6720,
  sequentialMs: jobs.reduce((sum, j) => sum + j.endMs - j.startMs, 0),
  speedup: 1.7,
  providersUsed: ['daytona', 'blaxel', 'upstash', 'vercel'],
  jobs,
};
