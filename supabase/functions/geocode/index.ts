/**
 * Edge Function: geocode
 * Преобразует текстовый адрес в координаты через Яндекс.Геокодер.
 * Ключ API хранится на сервере (env-переменная YANDEX_GEOCODER_API_KEY),
 * не передаётся на клиент.
 *
 * Доступ: только admin
 * POST /functions/v1/geocode
 * Body: { "address": "ул. Ленина 15, Москва" }
 * Response: { "latitude": 55.751244, "longitude": 37.618423 }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  // Проверяем роль admin через RLS
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .single()

  if (profileError || profile?.role !== 'admin') {
    return jsonResponse({ error: 'Forbidden: admin role required' }, 403)
  }

  let body: { address?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { address } = body
  if (!address?.trim()) {
    return jsonResponse({ error: 'address is required' }, 400)
  }

  const apiKey = Deno.env.get('YANDEX_GEOCODER_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'Geocoder API key not configured' }, 503)
  }

  const geocodeUrl =
    `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}` +
    `&geocode=${encodeURIComponent(address)}&format=json&results=1&lang=ru_RU`

  let geocodeRes: Response
  try {
    geocodeRes = await fetch(geocodeUrl)
  } catch {
    return jsonResponse({ error: 'Geocoder service unavailable' }, 503)
  }

  if (!geocodeRes.ok) {
    return jsonResponse({ error: 'Geocoder returned an error', status: geocodeRes.status }, 503)
  }

  const geoData = await geocodeRes.json()
  const members = geoData?.response?.GeoObjectCollection?.featureMember

  if (!members || members.length === 0) {
    return jsonResponse({ error: 'Address not found' }, 400)
  }

  // Яндекс возвращает координаты в порядке: longitude latitude
  const [lonStr, latStr] = members[0].GeoObject.Point.pos.split(' ')
  const latitude = parseFloat(latStr)
  const longitude = parseFloat(lonStr)

  if (isNaN(latitude) || isNaN(longitude)) {
    return jsonResponse({ error: 'Failed to parse coordinates' }, 500)
  }

  return jsonResponse({ latitude, longitude })
})
