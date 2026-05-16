import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL         = Deno.env.get('SUPABASE_URL')!
const SVC_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET')!

type Sub = { id: string; endpoint: string; p256dh: string; auth_key: string }

async function sendToSub(sub: Sub, payload: string, db: ReturnType<typeof createClient>): Promise<void> {
  try {
    const pub    = Deno.env.get('VAPID_PUBLIC_KEY')!
    const jwk    = JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK')!)
    const { default: webpush } = await import('npm:web-push@3')
    webpush.setVapidDetails('https://alliby.ru', pub, jwk.d as string)
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      payload,
      { TTL: 86400 }
    )
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 410 || status === 404) {
      await db.from('push_subscriptions').delete().eq('id', sub.id)
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-push-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { type, record, old_record } = await req.json()
  if (!record) return new Response('ok')

  const db      = createClient(SB_URL, SVC_KEY)
  const shortId = (record.id as string).slice(-6).toUpperCase()

  let subs: Sub[] = []
  let notif: { title: string; body: string; data: Record<string, string> } | null = null

  if (type === 'INSERT') {
    notif = {
      title: 'Новый заказ',
      body:  `#${shortId} · ${Number(record.total_amount).toFixed(0)} ₽`,
      data:  { orderId: record.id, screen: 'orders' },
    }
    const { data } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('app', 'admin')
    subs = (data ?? []) as Sub[]
  } else if (type === 'UPDATE' && record.status !== old_record?.status) {
    const labels: Record<string, string> = {
      paid:      'Оплачен',
      ready:     'Готов к выдаче — забирайте!',
      issued:    'Выдан. Приятного аппетита!',
      cancelled: 'Отменён',
    }
    const label = labels[record.status as string]
    if (!label) return new Response('ok')
    notif = {
      title: 'Статус заказа',
      body:  `#${shortId}: ${label}`,
      data:  { orderId: record.id, screen: 'orders' },
    }
    const { data } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth_key')
      .eq('user_id', record.user_id).eq('app', 'client')
    subs = (data ?? []) as Sub[]
  } else {
    return new Response('ok')
  }

  // Return immediately — push runs in background after response
  const response = new Response('ok')
  Promise.all(subs.map((sub) => sendToSub(sub, JSON.stringify(notif), db))).catch(() => {})
  return response
})
