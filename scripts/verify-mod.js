import { fileURLToPath } from 'node:url';
import { verifyModBundle } from '../src/bundle.js';

const directory = fileURLToPath(new URL('../dist/', import.meta.url));
console.log(JSON.stringify(await verifyModBundle(directory), null, 2));
