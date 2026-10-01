/**
 * Edge Function: calendar-feed
 * Персональная ICS-лента: записи (в т.ч. тренировки/занятия) и аренда пользователя.
 * GET /functions/v1/calendar-feed?t=<token>   (без JWT — для подписки Google/Apple)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const pad = (n: number) => String(n).padStart(2, '0')

function tzOffsetMs(utcMs: number, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const g = (t: string) => Number(p.find(x => x.type === t)!.value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - utcMs
}

// «дата + время» в часовом поясе заведения → UTC ms
function localToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0)
  let utc = guess - tzOffsetMs(guess, tz)
  utc = guess - tzOffsetMs(utc, tz)
  return utc
}

function icsDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

const esc = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 74) return line
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 73 : 74)) { out.push(cur); cur = ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

interface Ev { uid: string; start: number; end: number; summary: string; location?: string; desc?: string }

Deno.serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('t') || ''
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Not found', { status: 404 })

  const { data: tk } = await sb.from('calendar_feed_tokens').select('user_id').eq('token', token).maybeSingle()
  if (!tk) return new Response('Not found', { status: 404 })
  const uid = tk.user_id as string

  const since = new Date(Date.now() - 60 * 86400_000)
  const sinceDate = since.toISOString().slice(0, 10)

  const [bk, rent, mbk] = await Promise.all([
    sb.from('bookings')
      .select('id,slot_date,slot_start,slot_end,status,master_id,menu_items(name),stores(name,address,timezone)')
      .eq('user_id', uid).in('status', ['booked', 'completed']).gte('slot_date', sinceDate)
      .not('slot_start', 'is', null).limit(1000),
    sb.from('rent_reservations')
      .select('id,start_at,end_at,quantity,status,menu_items(name),stores(name,address)')
      .eq('user_id', uid).in('status', ['pending', 'active', 'completed']).gte('end_at', since.toISOString()).limit(1000),
    // Записи к этому пользователю как к мастеру/тренеру/преподавателю
    sb.from('bookings')
      .select('id,user_id,menu_item_id,slot_date,slot_start,slot_end,menu_items(name),stores(name,address,timezone)')
      .eq('master_id', uid).in('status', ['booked', 'completed']).gte('slot_date', sinceDate)
      .not('slot_start', 'is', null).limit(2000),
  ])

  // Заведения, которыми пользователь управляет (владелец или сотрудник)
  const [own, prof] = await Promise.all([
    sb.from('stores').select('id').eq('owner_user_id', uid),
    sb.from('profiles').select('employee_store_id').eq('id', uid).maybeSingle(),
  ])
  const storeIds = [...new Set([...(own.data || []).map((x: any) => x.id), prof.data?.employee_store_id].filter(Boolean))] as string[]
  let sbk: any[] = [], srent: any[] = []
  if (storeIds.length) {
    const [a, b] = await Promise.all([
      sb.from('bookings')
        .select('id,user_id,master_id,menu_item_id,slot_date,slot_start,slot_end,menu_items(name),stores(name,address,timezone)')
        .in('store_id', storeIds).neq('user_id', uid).in('status', ['booked', 'completed']).gte('slot_date', sinceDate)
        .not('slot_start', 'is', null).limit(3000),
      sb.from('rent_reservations')
        .select('id,user_id,start_at,end_at,quantity,menu_items(name),stores(name,address)')
        .in('store_id', storeIds).neq('user_id', uid).in('status', ['pending', 'active', 'completed']).gte('end_at', since.toISOString()).limit(3000),
    ])
    // записи, где пользователь — мастер, уже в ленте мастера
    sbk = (a.data || []).filter((x: any) => x.master_id !== uid)
    srent = b.data || []
  }

  const masterIds = [...new Set([...(bk.data || []), ...sbk].map((b: any) => b.master_id).filter(Boolean))]
  const masters: Record<string, string> = {}
  if (masterIds.length) {
    const { data } = await sb.from('profiles').select('id,full_name').in('id', masterIds)
    ;(data || []).forEach((p: any) => { if (p.full_name) masters[p.id] = p.full_name })
  }

  const clientIds = [...new Set([...(mbk.data || []), ...sbk, ...srent].map((b: any) => b.user_id).filter(Boolean))]
  const clients: Record<string, string> = {}
  if (clientIds.length) {
    const { data } = await sb.from('profiles').select('id,full_name').in('id', clientIds)
    ;(data || []).forEach((p: any) => { clients[p.id] = p.full_name || 'Клиент' })
  }

  const events: Ev[] = []
  for (const b of (bk.data || []) as any[]) {
    const tz = b.stores?.timezone || 'Europe/Moscow'
    const start = localToUtc(b.slot_date, String(b.slot_start).slice(0, 5), tz)
    const end = localToUtc(b.slot_date, String(b.slot_end).slice(0, 5), tz)
    if (!(end > start)) continue
    events.push({
      uid: `bk-${b.id}@alliby.ru`, start, end,
      summary: b.menu_items?.name || 'Запись',
      location: [b.stores?.name, b.stores?.address].filter(Boolean).join(', '),
      desc: [b.stores?.name, b.master_id && masters[b.master_id] ? `Специалист: ${masters[b.master_id]}` : ''].filter(Boolean).join('\n'),
    })
  }
  // Групповые занятия — несколько записей с общим слотом → одно событие со списком участников
  const groups = new Map<string, any[]>()
  for (const b of (mbk.data || []) as any[]) {
    const k = `${b.menu_item_id}|${b.slot_date}|${b.slot_start}|${b.slot_end}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(b)
  }
  for (const [k, arr] of groups) {
    const b = arr[0]
    const tz = b.stores?.timezone || 'Europe/Moscow'
    const start = localToUtc(b.slot_date, String(b.slot_start).slice(0, 5), tz)
    const end = localToUtc(b.slot_date, String(b.slot_end).slice(0, 5), tz)
    if (!(end > start)) continue
    const names = arr.map(x => clients[x.user_id] || 'Клиент')
    events.push({
      uid: `mst-${arr.map(x => x.id).sort()[0]}@alliby.ru`, start, end,
      summary: `${b.menu_items?.name || 'Запись'} — ${names.length > 1 ? `${names.length} уч.` : names[0]}`,
      location: [b.stores?.name, b.stores?.address].filter(Boolean).join(', '),
      desc: [b.stores?.name, `Клиенты: ${names.join(', ')}`].filter(Boolean).join('\n'),
    })
  }
  // Записи и аренды заведения (для владельца/сотрудника)
  const sgroups = new Map<string, any[]>()
  for (const b of sbk) {
    const k = `${b.menu_item_id}|${b.master_id}|${b.slot_date}|${b.slot_start}|${b.slot_end}`
    if (!sgroups.has(k)) sgroups.set(k, [])
    sgroups.get(k)!.push(b)
  }
  for (const arr of sgroups.values()) {
    const b = arr[0]
    const tz = b.stores?.timezone || 'Europe/Moscow'
    const start = localToUtc(b.slot_date, String(b.slot_start).slice(0, 5), tz)
    const end = localToUtc(b.slot_date, String(b.slot_end).slice(0, 5), tz)
    if (!(end > start)) continue
    const names = arr.map(x => clients[x.user_id] || 'Клиент')
    events.push({
      uid: `st-${arr.map(x => x.id).sort()[0]}@alliby.ru`, start, end,
      summary: `${b.menu_items?.name || 'Запись'} — ${names.length > 1 ? `${names.length} уч.` : names[0]}`,
      location: [b.stores?.name, b.stores?.address].filter(Boolean).join(', '),
      desc: [b.stores?.name, b.master_id && masters[b.master_id] ? `Специалист: ${masters[b.master_id]}` : '', `Клиенты: ${names.join(', ')}`].filter(Boolean).join('\n'),
    })
  }
  for (const r of srent) {
    events.push({
      uid: `strent-${r.id}@alliby.ru`,
      start: new Date(r.start_at).getTime(), end: new Date(r.end_at).getTime(),
      summary: `Аренда: ${r.menu_items?.name || ''}${r.quantity > 1 ? ` ×${r.quantity}` : ''} — ${clients[r.user_id] || 'Клиент'}`,
      location: [r.stores?.name, r.stores?.address].filter(Boolean).join(', '),
      desc: [r.stores?.name, `Клиент: ${clients[r.user_id] || 'Клиент'}`].filter(Boolean).join('\n'),
    })
  }
  for (const r of (rent.data || []) as any[]) {
    events.push({
      uid: `rent-${r.id}@alliby.ru`,
      start: new Date(r.start_at).getTime(), end: new Date(r.end_at).getTime(),
      summary: `Аренда: ${r.menu_items?.name || ''}${r.quantity > 1 ? ` ×${r.quantity}` : ''}`,
      location: [r.stores?.name, r.stores?.address].filter(Boolean).join(', '),
      desc: r.stores?.name || '',
    })
  }

  const stamp = icsDate(Date.now())
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alliby//Calendar//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Alliby', 'X-WR-CALDESC:Записи, тренировки и аренда из Alliby',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${esc(e.summary)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    if (e.desc) lines.push(`DESCRIPTION:${esc(e.desc)}`)
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Alliby', 'TRIGGER:-PT1H', 'END:VALARM', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' },
  })
})
