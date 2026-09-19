import { z } from 'zod';
export const IdSchema = z.string().min(1).max(128);
export const HashSchema = z.string().length(64).regex(/^[a-f0-9]{64}$/);
export const RevisionSchema = z.number().int().min(0).max(2_147_483_647);
export const CounterSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const unique = <T>(values: T[]) => new Set(values).size === values.length;
