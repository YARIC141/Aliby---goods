import webpush from 'npm:web-push@3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

const SB_URL  = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

let vapidReady = false
try {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const jwkStr = Deno.env.get('VAPID_PRIVATE_JWK')
  if (pub && jwkStr) {
    const jwk = JSON.parse(jwkStr)
    webpush.setVapidDetails('mailto:yarich92@gmail.com', pub, jwk.d as string)
    vapidReady = true
  }
} catch { /* push disabled until VAPID keys are filled */ }

type PushSub = { id: string; endpoint: string; p256dh: string; auth_key: string }

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)

  const userClient = createClient(SB_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  const svc = createClient(SB_URL, SVC_KEY)

  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403)

  let body: { user_subscription_id?: string; quantity?: number }
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }

  const { user_subscription_id, quantity = 1 } = body
  if (!user_subscription_id) return jsonResponse({ error: 'user_subscription_id required' }, 400)
  const qty = Math.max(1, Math.min(20, Math.floor(Number(quantity) || 1)))

  const { data: us } = await svc
    .from('user_subscriptions')
    .select('id,user_id,status,remaining_uses,subscriptions(name,price,total_uses)')
    .eq('id', user_subscription_id)
    .single()

  if (!us) return jsonResponse({ error: 'Абонемент не найден' }, 404)

  const sub = us.subscriptions as { name: string; price: number; total_uses: number } | null
  const discPerUse = (sub && sub.total_uses > 0) ? +(sub.price / sub.total_uses).toFixed(2) : 0
  const clientUserId = us.user_id as string

  let remaining_uses = 0
  let redeemed = 0
  for (let i = 0; i < qty; i++) {
    const { data: res, error: rpcErr } = await svc.rpc('redeem_subscription', {
      p_user_subscription_id: user_subscription_id,
      p_order_id: null,
      p_amount_discounted: discPerUse,
    })
    if (rpcErr) {
      if (i === 0) return jsonResponse({ error: rpcErr.message || 'Ошибка списания' }, 409)
      break
    }
    const [row] = res as { redemption_id: string; remaining_uses: number }[]
    remaining_uses = row.remaining_uses
    redeemed++
  }

  if (vapidReady && clientUserId) {
    try {
      const { data: pushSubs } = await svc
        .from('push_subscriptions')
        .select('id,endpoint,p256dh,auth_key')
        .eq('user_id', clientUserId)
        .eq('app', 'client')

      if (pushSubs?.length) {
        const subName = sub?.name || 'Абонемент'
        const payload = JSON.stringify({
          title: 'Абонемент использован',
          body: `${subName}: −${redeemed === 1 ? '1 использование' : redeemed + ' исп.'} · осталось ${remaining_uses}`,
          data: { screen: 'home' },
        })
        await Promise.all((pushSubs as PushSub[]).map(async ps => {
          try {
            await webpush.sendNotification(
              { endpoint: ps.endpoint, keys: { p256dh: ps.p256dh, auth: ps.auth_key } },
              payload,
              { TTL: 86400 },
            )
          } catch (e: unknown) {
            const status = (e as { statusCode?: number }).statusCode
            if (status === 410 || status === 404) {
              await svc.from('push_subscriptions').delete().eq('id', ps.id)
            }
          }
        }))
      }
    } catch { /* non-fatal */ }
  }

  return jsonResponse({ success: true, remaining_uses, redeemed, amount_discounted: discPerUse * redeemed })
})
