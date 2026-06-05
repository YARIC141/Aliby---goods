/**
 * Edge Function: tbank-platform-notify-email
 * Runs daily via pg_cron. Sends renewal reminder emails 3 days before charge.
 * Auth: Bearer CRON_SECRET
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SMTP_HOST   = Deno.env.get('SMTP_HOST')   || 'smtp.gmail.com'
const SMTP_PORT   = parseInt(Deno.env.get('SMTP_PORT') || '587')
const SMTP_USER   = Deno.env.get('SMTP_USER')   || ''
const SMTP_PASS   = Deno.env.get('SMTP_PASS')   || ''
const SMTP_FROM   = Deno.env.get('SMTP_USER')   || ''
const SMTP_SENDER = Deno.env.get('SMTP_SENDER_NAME') || 'Aliby'

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  // Use Supabase GoTrue internal SMTP by calling the admin API to send a raw email
  // For self-hosted Supabase with Gmail SMTP, we use SMTP directly via TCP
  // Deno supports TCP via Deno.connect but STARTTLS requires extra work.
  // Simplest reliable approach: use fetch to a relay or Supabase edge SMTP.
  // Here we call Supabase's built-in auth email endpoint for custom email.

  // Alternative: use smtp.js / nodemailer-like Deno package
  // We use the `deno.land/x/smtp` approach below:
  const { SmtpClient } = await import('https://deno.land/x/smtp@v0.7.0/mod.ts')
  const client = new SmtpClient()
  await client.connectTLS({ hostname: SMTP_HOST, port: 465, username: SMTP_USER, password: SMTP_PASS })
  await client.send({ from: `${SMTP_SENDER} <${SMTP_FROM}>`, to, subject, content: 'text/html', html })
  await client.close()
}

function buildEmailHtml(storeName: string, amount: number, chargeDate: string, cancelUrl: string): string {
  const amtStr = amount.toLocaleString('ru-RU')
  return `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f9f9f7;margin:0;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
    <div style="font-size:22px;font-weight:700;margin-bottom:4px">Aliby</div>
    <div style="color:#6b7280;font-size:13px;margin-bottom:20px">Уведомление о списании</div>
    <p style="font-size:15px;color:#111;line-height:1.5">
      Через <strong>3 дня</strong> будет произведено автоматическое списание за ${storeName ? `заведение «${storeName}»` : 'подписку Aliby'}.
    </p>
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px">Сумма списания</div>
      <div style="font-size:24px;font-weight:700;color:#e8743b">${amtStr} ₽</div>
      <div style="font-size:13px;color:#6b7280;margin-top:6px">Дата списания: <strong>${chargeDate}</strong></div>
    </div>
    <p style="font-size:13px;color:#6b7280;line-height:1.5">
      Средства будут списаны с привязанной карты автоматически.
      Если вы хотите отключить автоплатёж — перейдите в личный кабинет.
    </p>
    <a href="${cancelUrl}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none;font-size:14px">
      Управление подпиской →
    </a>
    <p style="font-size:11px;color:#9ca3af;margin-top:20px">
      Aliby · admin.alliby.ru · По вопросам: поддержка в ЛК
    </p>
  </div>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })

  const cronSecret = Deno.env.get('CRON_SECRET') || ''
  if (cronSecret && req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const today   = new Date()
  const in3days = new Date(today)
  in3days.setDate(in3days.getDate() + 3)
  const targetDate = in3days.toISOString().split('T')[0]

  // Find subscriptions charging in 3 days with auto_renew=true
  const { data: subs } = await db
    .from('platform_subscriptions')
    .select('id, user_id, store_id, monthly_amount_kopecks, end_date, auto_renew, stores(name)')
    .eq('end_date', targetDate)
    .in('status', ['active', 'grace'])
    .eq('auto_renew', true)
    .not('rebill_id', 'is', null)

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const results: string[] = []

  for (const sub of subs) {
    try {
      // Get user email
      const { data: { user } } = await db.auth.admin.getUserById(sub.user_id)
      if (!user?.email) { results.push(`${sub.id}: no email`); continue }

      const amount    = Math.round((sub.monthly_amount_kopecks ?? 100000) / 100)
      const chargeDate = new Date(sub.end_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      const storeName  = (sub.stores as any)?.name ?? ''
      const subject    = storeName
        ? `Напоминание: списание ${amount.toLocaleString('ru-RU')} ₽ за «${storeName}» через 3 дня`
        : `Напоминание: списание ${amount.toLocaleString('ru-RU')} ₽ за подписку Aliby через 3 дня`

      const html = buildEmailHtml(storeName, amount, chargeDate, 'https://admin.alliby.ru/#profile')

      await sendEmail(user.email, subject, html)
      results.push(`${sub.id}: sent to ${user.email}`)
    } catch(e) {
      results.push(`${sub.id}: error ${e}`)
      console.error('[notify-email]', sub.id, e)
    }
  }

  return new Response(JSON.stringify({ sent: results.length, results }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
})
