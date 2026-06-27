import { vi } from "vitest";

export const mockQuery = {
  select:     vi.fn().mockReturnThis(),
  eq:         vi.fn().mockReturnThis(),
  neq:        vi.fn().mockReturnThis(),
  order:      vi.fn().mockReturnThis(),
  limit:      vi.fn().mockReturnThis(),
  gte:        vi.fn().mockReturnThis(),
  lte:        vi.fn().mockReturnThis(),
  lt:         vi.fn().mockReturnThis(),
  is:         vi.fn().mockReturnThis(),
  ilike:      vi.fn().mockReturnThis(),
  in:         vi.fn().mockReturnThis(),
  insert:     vi.fn().mockReturnThis(),
  update:     vi.fn().mockReturnThis(),
  upsert:     vi.fn().mockReturnThis(),
  delete:     vi.fn().mockReturnThis(),
  catch:      vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single:     vi.fn(),
};

export const supabase = {
  from: vi.fn(() => mockQuery),
  rpc:  vi.fn(),
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
};
