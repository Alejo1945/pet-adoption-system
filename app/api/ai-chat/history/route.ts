import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { user_id, conversation_id } = body

    if (!user_id || !conversation_id) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    if (user.id !== user_id) {
      return NextResponse.json({ error: 'No puedes borrar el historial de otro usuario' }, { status: 403 })
    }

    // 1. Borrado Híbrido Definitivo (Bypass de RLS si existe service role key)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
    const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseKey)

    let count = 0
    let deleteError: any = null

    // Intento 1: Borrado directo si existe la columna conversation_id
    const { count: directCount, error: directError } = await supabaseAdmin
      .from('chat_messages')
      .delete({ count: 'exact' })
      .eq('user_id', user_id)
      .eq('conversation_id', conversation_id)

    if (directError && directError.code === '42703') {
      // Intento 2 Fallback: La columna no existe, hacemos filtrado manual por JSON en content
      const { data: messages, error: fetchError } = await supabaseAdmin
        .from('chat_messages')
        .select('id, content')
        .eq('user_id', user_id)

      if (fetchError) {
        console.error("Error al buscar mensajes para fallback:", fetchError);
        throw fetchError;
      }

      const idsToDelete: string[] = []
      if (messages) {
        for (const row of messages) {
          if (row.content && row.content.startsWith('{')) {
            try {
              const parsed = JSON.parse(row.content)
              if (parsed.conversation_id === conversation_id) {
                idsToDelete.push(row.id)
              }
            } catch {}
          }
        }
      }

      if (idsToDelete.length > 0) {
        const { count: fallbackCount, error: fallbackDeleteError } = await supabaseAdmin
          .from('chat_messages')
          .delete({ count: 'exact' })
          .in('id', idsToDelete)

        if (fallbackDeleteError) {
          console.error("Error en borrado manual por ids:", fallbackDeleteError);
          throw fallbackDeleteError;
        }
        count = fallbackCount || 0
      }
    } else if (directError) {
      console.error("Error en borrado directo:", directError);
      throw directError;
    } else {
      count = directCount || 0
    }

    console.log("DELETE history:", { userId: user_id, conversationId: conversation_id });
    console.log("DELETE history result:", { data: 'OK', error: null, deletedCount: count });

    return NextResponse.json({ success: true, deletedCount: count })
  } catch (err: any) {
    console.log("DELETE result:", { data: null, error: err.message });
    return NextResponse.json({ error: `No se pudo borrar historial: ${err.message}` }, { status: 500 })
  }
}
