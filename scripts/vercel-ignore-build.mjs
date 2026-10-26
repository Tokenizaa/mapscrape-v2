#!/usr/bin/env node
/**
 * Vercel Ignored Build Step.
 *
 * Exit 0 only for documentation-only changes (Vercel skips the deployment).
 * Exit 1 for code/config changes or whenever the diff cannot be verified.
 */
import { execFileSync } from 'node:child_process';

const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
const current = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';

if (!previous || previous === 'HEAD') {
  console.log('Build required: previous deployment commit is unavailable.');
  process.exit(1);
}

let changed;
try {
  changed = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', previous, current],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
} catch {
  console.log('Build required: unable to verify changed files safely.');
  process.exit(1);
}

if (changed.length === 0) {
  console.log('Build required: no verifiable changed-file list.');
  process.exit(1);
}

const documentationOnly = changed.every((file) =>
  file.startsWith('docs/') ||
  /^README(?:\.[^/]*)?$/i.test(file) ||
  /^CHANGELOG(?:\.[^/]*)?$/i.test(file) ||
  /^CONTRIBUTING(?:\.[^/]*)?$/i.test(file) ||
  /^LICENSE(?:\.[^/]*)?$/i.test(file),
);

if (documentationOnly) {
  console.log('Skipping deployment: documentation-only change.');
  process.exit(0);
}

console.log('Build required: application, dependency, or configuration files changed.');
process.exit(1);
