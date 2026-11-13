// One real run of the agent race, recorded on fleet.flisk.si on 2026-11-13 with real pods on six providers.
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
  job('slugify', 'Add a slugify helper', 'freestyle', [
    ['start', 'Start a pod', 0, 1362, true, 'freestyle'],
    ['write', 'Write the code and tests', 1362, 1998, true, 'slug.py, test_slug.py'],
    ['test', 'Run the tests', 1998, 2299, true, '2 passed', ['test_punctuation ok', 'test_words ok']],
    ['stop', 'Stop the pod', 2299, 2573, true, ''],
  ]),
  job('duration', 'Parse "1h30m" into seconds', 'daytona', [
    ['start', 'Start a pod', 0, 3706, true, 'daytona'],
    ['write', 'Write the code and tests', 3706, 4917, true, 'duration.py, test_duration.py'],
    ['test', 'Run the tests', 4917, 5568, true, '2 passed', ['test_hours_minutes ok', 'test_seconds_only ok']],
    ['stop', 'Stop the pod', 5568, 5702, true, ''],
  ]),
  job('wordcount', 'Count words in a text', 'e2b', [
    ['start', 'Start a pod', 0, 361, true, 'e2b'],
    ['write', 'Write the code and tests', 361, 1373, true, 'words.py, test_words.py'],
    ['test', 'Run the tests', 1373, 1760, false, '1 of 2 failed', ['test_extra_spaces FAIL', 'test_simple ok']],
    ['fix', 'Write the fix', 1760, 2367, true, 'words.py'],
    ['test', 'Run the tests again', 2367, 3022, true, '2 passed', ['test_extra_spaces ok', 'test_simple ok']],
    ['stop', 'Stop the pod', 3022, 3732, true, ''],
  ]),
  job('roman', 'Turn numbers into Roman numerals', 'blaxel', [
    ['start', 'Start a pod', 0, 1069, true, 'blaxel'],
    ['write', 'Write the code and tests', 1069, 1445, true, 'roman.py, test_roman.py'],
    ['test', 'Run the tests', 1445, 1553, true, '2 passed', ['test_four ok', 'test_year ok']],
    ['stop', 'Stop the pod', 1553, 1640, true, ''],
  ]),
  job('palindrome', 'Check if a text is a palindrome', 'upstash', [
    ['start', 'Start a pod', 0, 1030, true, 'upstash'],
    ['write', 'Write the code and tests', 1030, 1571, true, 'palin.py, test_palin.py'],
    ['test', 'Run the tests', 1571, 1942, true, '2 passed', ['test_not_one ok', 'test_sentence ok']],
    ['stop', 'Stop the pod', 1942, 2282, true, ''],
  ]),
  job('median', 'Find the median of a list', 'vercel', [
    ['start', 'Start a pod', 0, 388, true, 'vercel'],
    ['write', 'Write the code and tests', 388, 818, true, 'median.py, test_median.py'],
    ['test', 'Run the tests', 818, 1326, true, '2 passed', ['test_even ok', 'test_odd ok']],
    ['stop', 'Stop the pod', 1326, 1519, true, ''],
  ]),
];

export const RECORDED = {
  recordedOn: '2026-11-13',
  ok: true,
  passed: 6,
  fixed: 1,
  total: 6,
  totalMs: 5702,
  sequentialMs: jobs.reduce((sum, j) => sum + j.endMs - j.startMs, 0),
  speedup: 3.1,
  providersUsed: ['freestyle', 'daytona', 'e2b', 'blaxel', 'upstash', 'vercel'],
  jobs,
};
