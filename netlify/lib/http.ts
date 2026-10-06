// Shared helpers for every API function: JSON responses, validation, error mapping.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const normalizeUid = (u: unknown) =>
  String(u == null ? "" : u).replace(/[\s:\-]/g, "").toUpperCase();
export const validUid = (u: string) => /^[0-9A-F]{8,20}$/.test(u);
export const validUrl = (u: string) => {
  try {
    return ["http:", "https:"].includes(new URL(u).protocol);
  } catch {
    return false;
  }
};

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new ApiError(400, "Invalid JSON in request body");
}

// Postgres unique violation, possibly wrapped by Drizzle.
export const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;

// Wraps a handler so thrown errors become clean JSON responses with no stack traces.
export const handle =
  (methods: string[], fn: Handler) =>
  async (req: Request, context: { params?: Record<string, string> }) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (!methods.includes(req.method)) {
      return json({ success: false, message: "Method not allowed" }, 405);
    }
    try {
      return await fn(req, context?.params || {});
    } catch (err) {
      if (err instanceof ApiError) return json({ success: false, message: err.message }, err.status);
      if (isUniqueViolation(err)) {
        return json({ success: false, message: "Duplicate data (card UID or student ID may already exist)" }, 409);
      }
      console.error(err);
      return json({ success: false, message: "Internal server error" }, 500);
    }
  };
