import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const results: any = {}

  try {
    // 1. Leer chat_messages
    const { data: msgs, error: msgErr } = await supabase.from('chat_messages').select('*').limit(5)
    results.chat_messages = { data: msgs, error: msgErr }

    // 2. Leer favorites
    const { data: favs, error: favErr } = await supabase.from('favorites').select('*').limit(5)
    results.favorites = { data: favs, error: favErr }

    // 3. Obtener el auth
    const { data: user } = await supabase.auth.getUser()
    results.user = user

    return NextResponse.json(results)
  } catch (err: any) {
    return NextResponse.json({ error: err.message })
  }
}
