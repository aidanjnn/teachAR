// Build-time only. Generate the structural C# readers from these same Zod schemas.
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import * as contracts from '../src/index.js';
const registry = z.registry<{id: string}>();
for (const [name, schema] of Object.entries(contracts)) {
  if (name.endsWith('Schema') && schema instanceof z.ZodType && !name.startsWith('Vision') && name !== 'HealthSchema') registry.add(schema, {id: name.slice(0, -6)});
}
writeFileSync(process.argv[2]!, JSON.stringify(z.toJSONSchema(registry), null, 2));
