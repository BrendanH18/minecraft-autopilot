import { fileURLToPath } from 'node:url';

// The planner commands run through the core CLI, so the tests spawn it by absolute path and work from any directory.
export const CLI_PATH = fileURLToPath(new URL('../../../src/cli.js', import.meta.url));
