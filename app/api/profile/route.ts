import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/profile — perfil del usuario autenticado
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    profile: {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.user_metadata?.full_name || '',
      role: user.user_metadata?.role || profile?.role || 'cliente',
      created_at: user.created_at,
    }
  })
}

// PUT /api/profile — actualizar nombre del perfil
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { full_name } = await request.json()
  if (!full_name?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

  // Actualizar en la tabla profiles
  const { error: dbError } = await supabase
    .from('profiles')
    .update({ full_name: full_name.trim(), updated_at: new Date().toISOString() })
    .eq('id', user.id)

  // Actualizar en user_metadata de Supabase Auth
  const { error: authError } = await supabase.auth.updateUser({
    data: { full_name: full_name.trim() }
  })

  if (dbError || authError) {
    return NextResponse.json({ error: dbError?.message || authError?.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, full_name: full_name.trim() })
}
