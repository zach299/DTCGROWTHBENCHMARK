import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAtsInHtml, classifyRoles } from '../lib/providers/jobs.ts';

test('detects each ATS from careers-page HTML', () => {
  assert.deepEqual(detectAtsInHtml('<a href="https://boards.greenhouse.io/ruggable">Jobs</a>'), { provider: 'greenhouse', slug: 'ruggable' });
  assert.deepEqual(detectAtsInHtml('<a href="https://jobs.lever.co/gymshark?x=1">Careers</a>'), { provider: 'lever', slug: 'gymshark' });
  assert.deepEqual(detectAtsInHtml('href="https://jobs.ashbyhq.com/Comfrt"'), { provider: 'ashby', slug: 'comfrt' });
  assert.deepEqual(detectAtsInHtml('src="https://mybrand.recruitee.com/embed"'), { provider: 'recruitee', slug: 'mybrand' });
  assert.equal(detectAtsInHtml('<html>no ats here</html>'), null);
});

test('www is never mistaken for a recruitee slug', () => {
  assert.equal(detectAtsInHtml('<a href="https://www.recruitee.com/pricing">Recruitee</a>'), null);
});

test('classifies growth vs ops roles', () => {
  const { growth, ops } = classifyRoles([
    { title: 'Senior Performance Marketing Manager', department: null, location: null },
    { title: 'Growth Lead', department: 'Marketing', location: null },
    { title: 'Warehouse Associate', department: 'Operations', location: 'Ohio' },
    { title: 'Supply Chain Analyst', department: null, location: null },
    { title: 'Software Engineer', department: 'Eng', location: null },
  ]);
  assert.equal(growth, 2);
  assert.equal(ops, 2);
});

test('classify handles empty input', () => {
  assert.deepEqual(classifyRoles([]), { growth: 0, ops: 0 });
});
