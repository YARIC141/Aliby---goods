// Edge-runtime main service — routes requests to individual function workers.
// Required by supabase/edge-runtime --main-service flag.
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

const FUNCTIONS_PATH = '/home/deno/functions'

serve(async (req: Request) => {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(p => p.length > 0)
  const functionName = pathParts[0]

  if (!functionName) {
    return new Response(
      JSON.stringify({ error: 'function name is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `${FUNCTIONS_PATH}/${functionName}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    })
    return await worker.fetch(req)
  } catch (e: unknown) {
    const err = e as Error
    const notFound = err.name === 'NotFoundError' || err.message?.includes('not found')
    return new Response(
      JSON.stringify({ error: notFound ? `Function '${functionName}' not found` : err.message }),
      {
        status: notFound ? 404 : 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
})
