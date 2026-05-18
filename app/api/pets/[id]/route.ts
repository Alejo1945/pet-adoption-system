import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { logOperation } from '@/lib/logger'
import { generateEmbedding, getPetEmbeddingText, vectorToString } from '@/lib/embeddings'

// GET /api/pets/[id]
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: pet, error } = await supabase
    .from('pets')
    .select('*, profiles(full_name, role)')
    .eq('id', id)
    .single()

  if (error || !pet) return NextResponse.json({ error: 'Mascota no encontrada' }, { status: 404 })
  return NextResponse.json({ pet })
}

// PUT /api/pets/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = user.user_metadata?.role ?? 'cliente'

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Solo admin o dueño puede actualizar
  const { data: existing } = await supabase.from('pets').select('user_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (role !== 'admin' && existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { name, species, breed, age, description, status } = body

  // Validaciones
  const errors: string[] = []
  if (!name?.trim()) errors.push('El nombre es requerido')
  if (!species?.trim()) errors.push('La especie es requerida')
  if (!description?.trim()) errors.push('La descripción es requerida')

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; '), errors }, { status: 400 })
  }

  // Regenerar embedding con la descripción actualizada para mantener coherencia semántica
  const embeddingText = getPetEmbeddingText({ name, species, breed, description })
  const embedding = generateEmbedding(embeddingText)

  const { data: pet, error } = await supabase
    .from('pets')
    .update({
      name: name.trim(),
      species,
      breed: breed?.trim() ?? '',
      age: parseInt(age as string) || 0,
      description: description.trim(),
      status: status ?? 'disponible',
      embedding: vectorToString(embedding),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logOperation({ operation_type: 'update_pet', user_id: user.id, success: true, metadata: { pet_id: id } })
  return NextResponse.json({ pet })
}

// DELETE /api/pets/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const role = user.user_metadata?.role ?? 'cliente'
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Solo admin puede eliminar' }, { status: 403 })
  }

  const { error } = await supabase.from('pets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logOperation({ operation_type: 'delete_pet', user_id: user.id, success: true, metadata: { pet_id: id } })
  return NextResponse.json({ success: true })
}
