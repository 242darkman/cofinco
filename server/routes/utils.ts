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

export const parsePagination = (query: Record<string, unknown>, defaults?: { page?: number; perPage?: number }) => {
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const rawPerPage = Array.isArray(query.per_page) ? query.per_page[0] : query.per_page;

  const page = Math.max(1, Number(rawPage ?? defaults?.page ?? 1) || 1);
  const perPage = Math.max(1, Number(rawPerPage ?? defaults?.perPage ?? 25) || 25);

  return {
    page,
    perPage,
    offset: (page - 1) * perPage,
  };
};

const buildPaginationLink = (
  path: string,
  query: Record<string, unknown> | undefined,
  page: number,
  perPage: number
) => {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (key === "page" || key === "per_page") continue;
      if (Array.isArray(value)) {
        value.forEach((entry) => params.append(key, String(entry)));
      } else {
        params.set(key, String(value));
      }
    }
  }
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  return `${path}?${params.toString()}`;
};

export const paginateResponse = <T>(
  data: T[],
  totalItems: number,
  page: number,
  perPage: number,
  options: { path: string; query?: Record<string, unknown>; filters?: Record<string, unknown> } = { path: "" }
) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safePage = Math.min(page, totalPages);

  const self = buildPaginationLink(options.path, options.query, safePage, perPage);
  const next = safePage < totalPages ? buildPaginationLink(options.path, options.query, safePage + 1, perPage) : null;
  const prev = safePage > 1 ? buildPaginationLink(options.path, options.query, safePage - 1, perPage) : null;

  return {
    success: true,
    data,
    meta: {
      pagination: {
        page: safePage,
        per_page: perPage,
        total_items: totalItems,
        total_pages: totalPages,
      },
      filters: options.filters || {},
    },
    links: {
      self,
      next,
      prev,
    },
  };
};
