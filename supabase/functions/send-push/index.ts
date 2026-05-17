import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL         = Deno.env.get('SUPABASE_URL')!
const SVC_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET')!

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-push-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  return new Response('ok')
})
