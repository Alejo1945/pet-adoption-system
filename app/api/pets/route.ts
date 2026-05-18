import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding, getPetEmbeddingText, vectorToString } from '@/lib/embeddings'
import { logOperation, logVectorOperation } from '@/lib/logger'

// GET /api/pets — lista de mascotas
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Usar rol del JWT (user_metadata) — siempre confiable
    const roleFromJWT = user.user_metadata?.role ?? 'cliente'
    const isAdmin = roleFromJWT === 'admin'

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const species = url.searchParams.get('species')

    let query = supabase
      .from('pets')
      .select('id, name, species, breed, age, description, status, created_at, user_id, latency_ms, profiles(full_name)')
      .order('created_at', { ascending: false })

    // Clientes solo ven disponibles + las suyas
    if (!isAdmin) {
      query = query.or(`status.eq.disponible,user_id.eq.${user.id}`)
    }

    if (status) query = query.eq('status', status)
    if (species) query = query.eq('species', species)

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ pets: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST /api/pets — crear mascota
export async function POST(request: NextRequest) {
  const startTime = performance.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    await logOperation({ operation_type: 'insert_pet', user_id: user.id, success: false, error_message: 'JSON inválido' })
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { name, species, breed, age, description } = body

  // Validaciones
  const errors: string[] = []
  if (!name?.trim()) errors.push('El nombre es requerido')
  if (!species?.trim()) errors.push('La especie es requerida')
  if (!description?.trim()) errors.push('La descripción es requerida')

  if (errors.length > 0) {
    await logOperation({
      operation_type: 'insert_pet', user_id: user.id, success: false,
      error_message: errors.join('; '), latency_ms: performance.now() - startTime
    })
    return NextResponse.json({ error: errors.join('; '), errors }, { status: 400 })
  }

  // Generar embedding
  const embeddingStart = performance.now()
  const embeddingText = getPetEmbeddingText({ name, species, breed, description })
  const embedding = generateEmbedding(embeddingText)
  const embeddingTime = performance.now() - embeddingStart

  // Insertar mascota
  const { data: pet, error } = await supabase.from('pets').insert({
    name: name.trim(),
    species,
    breed: breed?.trim() ?? '',
    age: parseInt(age as string) || 0,
    description: description.trim(),
    status: 'disponible',
    user_id: user.id,
    embedding: vectorToString(embedding),
    latency_ms: performance.now() - startTime,
  }).select().single()

  const totalLatency = performance.now() - startTime

  if (error) {
    await logOperation({
      operation_type: 'insert_pet', user_id: user.id, success: false,
      error_message: error.message, latency_ms: totalLatency
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Logs de éxito
  await logOperation({
    operation_type: 'insert_pet', user_id: user.id, success: true,
    latency_ms: totalLatency, metadata: { pet_id: pet.id }
  })
  await logVectorOperation({
    operation_type: 'insert', user_id: user.id,
    latency_ms: totalLatency, embedding_time_ms: embeddingTime
  })

  return NextResponse.json({ pet }, { status: 201 })
}
