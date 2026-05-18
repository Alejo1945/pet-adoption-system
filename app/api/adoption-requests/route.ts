import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { logOperation } from '@/lib/logger'

function getAdminClient(normalClient: any) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseKey) {
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
    return createSupabaseClient(supabaseUrl, supabaseKey)
  }
  return normalClient
}

// GET /api/adoption-requests
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || user.user_metadata?.role || 'cliente'

  const client = role === 'admin' ? getAdminClient(supabase) : supabase

  let query = client
    .from('adoption_requests')
    .select('*, pets(name, species, breed, status), profiles(full_name)')
    .order('created_at', { ascending: false })

  if (role !== 'admin') {
    query = query.eq('user_id', user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

// POST /api/adoption-requests
export async function POST(request: NextRequest) {
  const startTime = performance.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const { pet_id, notes } = body

  if (!pet_id) {
    await logOperation({ operation_type: 'adoption_request', user_id: user.id, success: false, error_message: 'pet_id requerido' })
    return NextResponse.json({ error: 'pet_id es requerido' }, { status: 400 })
  }

  // Verificar que la mascota esté disponible
  const { data: pet } = await supabase.from('pets').select('status, name').eq('id', pet_id).single()
  if (!pet) {
    return NextResponse.json({ error: 'Mascota no encontrada' }, { status: 404 })
  }
  if (pet.status !== 'disponible') {
    await logOperation({ operation_type: 'adoption_request', user_id: user.id, success: false, error_message: 'Mascota no disponible', latency_ms: performance.now() - startTime })
    return NextResponse.json({ error: `${pet.name} no está disponible para adopción` }, { status: 400 })
  }

  // Verificar que no haya una solicitud previa activa
  const { data: existing } = await supabase
    .from('adoption_requests')
    .select('id')
    .eq('pet_id', pet_id)
    .eq('user_id', user.id)
    .eq('status', 'pendiente')
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Ya tienes una solicitud pendiente para esta mascota' }, { status: 400 })
  }

  const { data: adoptionRequest, error } = await supabase
    .from('adoption_requests')
    .insert({ pet_id, user_id: user.id, notes: notes ?? '', status: 'pendiente' })
    .select('*, pets(name, species), profiles(full_name)')
    .single()

  if (error) {
    await logOperation({ operation_type: 'adoption_request', user_id: user.id, success: false, error_message: error.message, latency_ms: performance.now() - startTime })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Actualizar estado de la mascota a "en_proceso"
  await supabase.from('pets').update({ status: 'en_proceso' }).eq('id', pet_id)

  // Enviar notificación a todos los administradores
  try {
    const clientName = (adoptionRequest as any).profiles?.full_name || user.email?.split('@')[0] || 'Un cliente'
    const petName = (adoptionRequest as any).pets?.name || 'una mascota'
    await supabase.rpc('notify_admins', {
      p_title: 'Nueva solicitud de adopción 🐾',
      p_message: `${clientName} quiere adoptar a ${petName}.`,
      p_link: '/dashboard/requests'
    })
  } catch (notifErr) {
    console.error('Error al notificar administradores:', notifErr)
  }

  await logOperation({ operation_type: 'adoption_request', user_id: user.id, success: true, latency_ms: performance.now() - startTime, metadata: { pet_id, request_id: adoptionRequest.id } })
  return NextResponse.json({ request: adoptionRequest }, { status: 201 })
}

// PATCH /api/adoption-requests — actualizar estado (solo admin)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || user.user_metadata?.role || 'cliente'
  if (role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const client = getAdminClient(supabase)

  const { request_id, status } = await request.json()
  if (!request_id || !status) return NextResponse.json({ error: 'request_id y status requeridos' }, { status: 400 })

  const { data: updatedRequest, error } = await client
    .from('adoption_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', request_id)
    .select('*, pets(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si se aprueba, marcar mascota como adoptada
  if (status === 'aprobada' && updatedRequest?.pets) {
    const petId = (updatedRequest.pets as any).id
    await client.from('pets').update({ status: 'adoptado' }).eq('id', petId)
  }
  // Si se rechaza, devolver a disponible
  if (status === 'rechazada' && updatedRequest?.pets) {
    const petId = (updatedRequest.pets as any).id
    await client.from('pets').update({ status: 'disponible' }).eq('id', petId)
  }

  // Notificar al cliente sobre el cambio de estado de su solicitud
  try {
    const petName = (updatedRequest.pets as any)?.name || 'la mascota'
    const title = status === 'aprobada' ? '¡Solicitud Aprobada! 🎉' : 'Solicitud Rechazada 😔'
    const message = status === 'aprobada'
      ? `¡Felicidades! Tu solicitud para adoptar a ${petName} ha sido aprobada. Nos pondremos en contacto contigo pronto.`
      : `Lamentamos informarte que tu solicitud para adoptar a ${petName} ha sido rechazada.`

    await client.from('notifications').insert({
      user_id: updatedRequest.user_id,
      title,
      message,
      link: '/dashboard/my-requests',
      type: status === 'aprobada' ? 'success' : 'error'
    })
  } catch (notifErr) {
    console.error('Error al notificar al cliente:', notifErr)
  }

  return NextResponse.json({ request: updatedRequest })

}
