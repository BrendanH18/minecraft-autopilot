import { fileURLToPath } from 'node:url';
import { verifyModArchive } from '../src/bundle.js';

const directory = fileURLToPath(new URL('../dist/', import.meta.url));
console.log(JSON.stringify(await verifyModArchive(directory), null, 2));
