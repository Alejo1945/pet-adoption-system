import { getSystemMetrics } from '@/lib/metrics'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/metrics — métricas del sistema (solo admin)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const role = profile?.role || user.user_metadata?.role || 'cliente'
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Solo admin puede ver métricas' }, { status: 403 })
  }

  const metrics = await getSystemMetrics()
  return NextResponse.json({ metrics })
}
