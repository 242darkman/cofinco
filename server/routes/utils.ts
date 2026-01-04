import { z } from "zod";

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

export const toCamelCaseKey = (key: string) =>
  key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());

export const toSnakeCaseKey = (key: string) =>
  key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

export const normalizeKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeKeysDeep(entry));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.includes("_") ? toCamelCaseKey(key) : key;
    normalized[normalizedKey] = normalizeKeysDeep(entry);
  }
  return normalized;
};

export const addSnakeCaseAliasesDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => addSnakeCaseAliasesDeep(entry));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const expanded: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const transformed = addSnakeCaseAliasesDeep(entry);
    expanded[key] = transformed;
    const snakeKey = key.includes("_") ? key : toSnakeCaseKey(key);
    if (snakeKey !== key && !(snakeKey in expanded)) {
      expanded[snakeKey] = transformed;
    }
  }
  return expanded;
};

export const unwrapSchema = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  let current = schema;
  while (true) {
    const typeName = (current as any)?._def?.typeName;
    if (typeName === z.ZodFirstPartyTypeKind.ZodOptional) {
      current = (current as any)._def.innerType;
      continue;
    }
    if (typeName === z.ZodFirstPartyTypeKind.ZodNullable) {
      current = (current as any)._def.innerType;
      continue;
    }
    if (typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
      current = (current as any)._def.innerType;
      continue;
    }
    if (typeName === z.ZodFirstPartyTypeKind.ZodEffects) {
      current = (current as any)._def.schema;
      continue;
    }
    break;
  }
  return current;
};

export const coerceValueToSchema = (schema: z.ZodTypeAny, value: unknown): unknown => {
  if (value === undefined || value === null || value === "") {
    return value;
  }
  const baseSchema = unwrapSchema(schema);
  const typeName = (baseSchema as any)?._def?.typeName;

  if (typeName === z.ZodFirstPartyTypeKind.ZodNumber) {
    if (typeof value === 'string') {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }
    return value;
  }
  
  if (typeName === z.ZodFirstPartyTypeKind.ZodBoolean) {
    if (typeof value === 'string') {
      return value === 'true';
    }
    return value;
  }
  
  if (typeName === z.ZodFirstPartyTypeKind.ZodDate) {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  }

  return value;
};
