import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function trackEvent(
  client: SupabaseClient,
  event: string,
  userId: string | null,
  properties: Record<string, unknown> = {},
  idempotencyKey?: string,
): Promise<void> {
  try {
    const row: Record<string, unknown> = { event, user_id: userId, properties }
    if (idempotencyKey) {
      row.idempotency_key = idempotencyKey
      await client
        .from('analytics_events')
        .upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    } else {
      await client.from('analytics_events').insert(row)
    }
  } catch (e) {
    console.error('[analytics] trackEvent failed:', event, e)
  }
}
