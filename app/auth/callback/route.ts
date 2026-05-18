import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Al confirmar el email, asegurarse de que el perfil tenga el rol correcto
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const role = user.user_metadata?.role ?? 'cliente'
        const fullName = user.user_metadata?.full_name ?? ''

        // Upsert del perfil con el rol del registro
        await supabase.from('profiles').upsert({
          id: user.id,
          full_name: fullName,
          role: role,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
