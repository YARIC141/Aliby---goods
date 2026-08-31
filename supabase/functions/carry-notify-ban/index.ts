/**
 * Edge Function: carry-notify-ban
 * Called by a Postgres trigger (notify_courier_banned, see migration
 * 20240101000125) whenever profiles.courier_banned flips to true.
 * Sends the courier an email — the primary moderation-notice channel per
 * §5.4а of the Carry offer (site.alliby.ru/carry-terms).
 * Auth: x-push-secret header (same shared secret as send-push).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PUSH_WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET')!

const SMTP_HOST   = Deno.env.get('SMTP_HOST')   || 'smtp.gmail.com'
const SMTP_USER   = Deno.env.get('SMTP_USER')   || ''
const SMTP_PASS   = Deno.env.get('SMTP_PASS')   || ''
const SMTP_FROM   = Deno.env.get('SMTP_USER')   || ''
const SMTP_SENDER = Deno.env.get('SMTP_SENDER_NAME') || 'Aliby Carry'

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { SmtpClient } = await import('https://deno.land/x/smtp@v0.7.0/mod.ts')
  const client = new SmtpClient()
  await client.connectTLS({ hostname: SMTP_HOST, port: 465, username: SMTP_USER, password: SMTP_PASS })
  await client.send({ from: `${SMTP_SENDER} <${SMTP_FROM}>`, to, subject, content: 'text/html', html })
  await client.close()
}

function buildEmailHtml(reason: string | null): string {
  return `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f9f9f7;margin:0;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
    <div style="font-size:22px;font-weight:700;margin-bottom:4px">Alliby Carry</div>
    <div style="color:#6b7280;font-size:13px;margin-bottom:20px">Уведомление о модерационной мере</div>
    <p style="font-size:15px;color:#111;line-height:1.5">
      Ваш доступ к получению заказов в Alliby&nbsp;Carry ограничен.
    </p>
    ${reason ? `
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px">Причина</div>
      <div style="font-size:15px;color:#111">${reason}</div>
    </div>` : ''}
    <p style="font-size:13px;color:#6b7280;line-height:1.5">
      Если вы считаете эту меру ошибочной, направьте мотивированное обращение на
      <a href="mailto:alliby.app@gmail.com" style="color:#e8743b">alliby.app@gmail.com</a> —
      это основной канал связи по вопросам модерации согласно п.&nbsp;5.4а Оферты Alliby&nbsp;Carry.
    </p>
    <p style="font-size:11px;color:#9ca3af;margin-top:20px">
      Alliby Carry · site.alliby.ru/carry-terms
    </p>
  </div>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })

  const secret = req.headers.get('x-push-secret')
  if (PUSH_WEBHOOK_SECRET && secret !== PUSH_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: { user_id?: string; reason?: string | null }
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!payload.user_id) return new Response('Missing user_id', { status: 400 })

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: { user } } = await db.auth.admin.getUserById(payload.user_id)
  if (!user?.email) {
    return new Response(JSON.stringify({ sent: false, reason: 'no email' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    await sendEmail(user.email, 'Alliby Carry: доступ ограничен', buildEmailHtml(payload.reason ?? null))
    return new Response(JSON.stringify({ sent: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('[carry-notify-ban]', e)
    return new Response(JSON.stringify({ sent: false, error: String(e) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
})
