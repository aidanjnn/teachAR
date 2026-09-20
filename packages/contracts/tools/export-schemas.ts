// Build-time JSON Schema export. Runtime refinements remain in the Zod schemas.
import { writeFileSync } from 'node:fs';
import { buildContractSchemas } from './schema-registry.js';
if (!process.argv[2]) throw new Error('Pass an output JSON path');
writeFileSync(process.argv[2], JSON.stringify(buildContractSchemas(), null, 2));
