import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const forbiddenMarkers = [
  'teacher.demo',
  'student.anna',
  'student.kirill',
  'student.outsider',
  'baam-demo',
  'mock-token:',
  'baam-max-mock-database-v1',
  '/auth/mock',
];

async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const failures = [];
  for (const entry of entries) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      failures.push(...(await inspect(file)));
    } else if (/\.(?:js|html|json|map)$/.test(file)) {
      const contents = await readFile(file, 'utf8');
      for (const marker of forbiddenMarkers) {
        if (contents.includes(marker)) failures.push(`${file}: ${marker}`);
      }
    }
  }
  return failures;
}

const failures = await inspect('dist');
if (failures.length > 0) {
  console.error('Production bundle contains demo code:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Production bundle: no demo accounts, passwords or mock API markers.');
}
