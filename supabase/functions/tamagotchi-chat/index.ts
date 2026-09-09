/**
 * Edge Function: tamagotchi-chat
 *
 * Прокси между статической страницей tamagotchi/index.html и Gemini через
 * OpenRouter (прямой Google AI Studio недоступен из РФ — см. обсуждение).
 * Ключ (OPENROUTER_API_KEY) живёт только здесь, на сервере — страница
 * тамагочи статическая и не может держать секреты в открытом виде.
 *
 * Доступ ограничен одним аккаунтом (yarich92@gmail.com): вызывающий обязан
 * прислать Authorization: Bearer <JWT> текущей Alliby-сессии; личность
 * резолвится через ${SUPABASE_URL}/auth/v1/user, все остальные — 403.
 *
 * POST /functions/v1/tamagotchi-chat
 * Headers: Authorization: Bearer <supabase JWT>
 * Body: {
 *   message: string,
 *   pet: { name, satiety, fat, energy, fun, mood },
 *   history: [{ role: 'user'|'pet', text }, ...]   // последние ~8 реплик
 * }
 * Response: { reply: string }
 */

const ALLOWED_ORIGINS = [
  'https://alliby.ru',
]

const ALLOWED_EMAIL = 'yarich92@gmail.com'

function corsHeadersFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonResponse(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' },
  })
}

interface ChatMsg { role: 'user' | 'pet'; text: string }
interface ChatBody {
  message?: string
  pet?: { name?: string; satiety?: number; fat?: number; energy?: number; fun?: number; mood?: string }
  history?: ChatMsg[]
}

function buildSystemPrompt(pet: ChatBody['pet']): string {
  const name = pet?.name || 'питомец'
  return (
    `Ты — виртуальный питомец-енот по имени ${name} в приложении Alliby. ` +
    `Твоё текущее состояние: сытость ${pet?.satiety ?? '?'}%, жир ${pet?.fat ?? '?'}%, ` +
    `энергия ${pet?.energy ?? '?'}%, веселье ${pet?.fun ?? '?'}%, настроение — «${pet?.mood ?? '?'}». ` +
    `Отвечай от своего лица, в характере, 1-3 короткими предложениями, на русском, ` +
    `дружелюбно и с учётом своего состояния (если сытость низкая — намекай, что хочешь есть; ` +
    `если энергия низкая — говори сонно и т.д). Никогда не говори, что ты нейросеть или ИИ, ` +
    `не выходи из роли питомца.`
  )
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(origin) })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Authorization required' }, 401, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) return jsonResponse({ error: 'Server misconfigured' }, 500, origin)

  let callerEmail: string | undefined
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      },
    })
    if (!userRes.ok) return jsonResponse({ error: 'Invalid session' }, 401, origin)
    const user = await userRes.json()
    callerEmail = user?.email
  } catch {
    return jsonResponse({ error: 'Auth check failed' }, 503, origin)
  }

  if (callerEmail !== ALLOWED_EMAIL) {
    return jsonResponse({ error: 'Forbidden' }, 403, origin)
  }

  let body: ChatBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin)
  }

  const message = body.message?.trim()
  if (!message) return jsonResponse({ error: 'message is required' }, 400, origin)
  if (message.length > 500) return jsonResponse({ error: 'message too long' }, 400, origin)

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'OpenRouter API key not configured' }, 503, origin)

  const history = Array.isArray(body.history) ? body.history.slice(-8) : []
  const messages = [
    { role: 'system', content: buildSystemPrompt(body.pet) },
    ...history.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ]

  let orRes: Response
  try {
    orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://alliby.ru',
        'X-Title': 'Alliby Tamagotchi',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.8-flash',
        messages,
        max_tokens: 200,
        temperature: 0.9,
      }),
    })
  } catch {
    return jsonResponse({ error: 'OpenRouter service unavailable' }, 503, origin)
  }

  if (!orRes.ok) {
    return jsonResponse({ error: 'OpenRouter returned an error', status: orRes.status }, 502, origin)
  }

  const data = await orRes.json()
  const reply = data?.choices?.[0]?.message?.content?.trim()
  if (!reply) return jsonResponse({ error: 'Empty response from OpenRouter' }, 502, origin)

  return jsonResponse({ reply }, 200, origin)
})
