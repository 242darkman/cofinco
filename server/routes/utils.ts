import { z, ZodError } from "zod";

// ============================================================================
// ERROR HANDLING HELPERS (strict — no `any`)
// ============================================================================

/** Safely extract an error message from an unknown thrown value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unknown error occurred";
}

/** Check if value is a plain record (no `any` cast needed) */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Well-known error types for accounting module */
export type HttpErrorCode =
  | "VALIDATION_ERROR"
  | "PERIOD_CLOSED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "ENDPOINT_DEPRECATED"
  | "INTERNAL_ERROR";

export interface HttpError {
  status: number;
  code: HttpErrorCode;
  message: string;
  details?: unknown;
}

/** Map an unknown error to a structured HTTP error object */
export function toHttpError(error: unknown): HttpError {
  // ZodError → 400 validation
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Données invalides",
      details: error.flatten().fieldErrors,
    };
  }

  // Known business errors encoded as Error with message keywords
  if (error instanceof Error) {
    const msg = error.message;

    if (msg.includes("Period is closed") || msg.includes("Période clôturée")) {
      return { status: 409, code: "PERIOD_CLOSED", message: msg };
    }
    if (msg.includes("not found") || msg.includes("non trouvé")) {
      return { status: 404, code: "NOT_FOUND", message: msg };
    }
    if (msg.includes("Forbidden") || msg.includes("interdit")) {
      return { status: 403, code: "FORBIDDEN", message: msg };
    }

    // Generic server error — surface the message but code 500
    return { status: 500, code: "INTERNAL_ERROR", message: msg };
  }

  return { status: 500, code: "INTERNAL_ERROR", message: "An unknown error occurred" };
}

// ============================================================================
// ZOD SCHEMAS — STRICT ACCOUNTING VALIDATION
// ============================================================================

/** Schema for a single line in a manual accounting entry */
const manualEntryLineSchema = z.object({
  compteId: z.string().uuid().optional(),
  numeroCompte: z.string().min(1).optional(),
  libelle: z.string().optional(),
  debit: z.preprocess(
    (v) => (typeof v === "string" ? parseFloat(v) : v),
    z.number().min(0, "Le débit ne peut pas être négatif")
  ).default(0),
  credit: z.preprocess(
    (v) => (typeof v === "string" ? parseFloat(v) : v),
    z.number().min(0, "Le crédit ne peut pas être négatif")
  ).default(0),
  refExterne: z.string().optional(),
}).refine(
  (l) => !!l.compteId || !!l.numeroCompte,
  { message: "Chaque ligne doit avoir compteId ou numeroCompte" }
).refine(
  (l) => !(l.debit > 0 && l.credit > 0),
  { message: "Une ligne ne peut pas avoir à la fois un débit et un crédit > 0" }
);

/** Full schema for POST /api/comptabilite/v2/ecritures */
export const manualEntrySchema = z.object({
  journalCode: z.string().min(1, "Code journal requis"),
  dateEcriture: z.string().min(1, "Date requise").refine(
    (d) => !isNaN(Date.parse(d)),
    { message: "Date invalide" }
  ),
  libelle: z.string().min(1, "Libellé requis"),
  lignes: z.array(manualEntryLineSchema)
    .min(2, "Au minimum 2 lignes d'écriture")
    .max(200, "Maximum 200 lignes"),
}).superRefine((data, ctx) => {
  const totalDebit = data.lignes.reduce((s, l) => s + l.debit, 0);
  const totalCredit = data.lignes.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `L'écriture n'est pas équilibrée: Débit=${totalDebit.toFixed(2)}, Crédit=${totalCredit.toFixed(2)}`,
      path: ["lignes"],
    });
  }
});

export type ManualEntryInput = z.infer<typeof manualEntrySchema>;

// ============================================================================
// KEY / VALUE CONVERSION UTILITIES
// ============================================================================

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
