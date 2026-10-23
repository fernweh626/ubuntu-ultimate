// Test stand-in: no network. Only what sync.ts/account.ts touch at import time.
export const supabase: any = { auth: { getSession: async () => ({ data: { session: null } }) }, from: () => ({}), rpc: async () => ({ data: null }) };
