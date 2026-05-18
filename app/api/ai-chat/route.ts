import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding, vectorToString } from '@/lib/embeddings'
import { getSystemMetrics } from '@/lib/metrics'

const GROQ_API_KEY = process.env.GROQ_API_KEY

// ============================================================================
// 1. FUNCIONES SEGURAS DE BASE DE DATOS (Supabase)
// ============================================================================

function getAdminClient(normalClient: any) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseKey) {
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
    return createSupabaseClient(supabaseUrl, supabaseKey)
  }
  return normalClient
}

async function getMyPendingRequests(supabase: any, userId: string) {
  const client = getAdminClient(supabase)
  const { data } = await client.from('adoption_requests').select('status, created_at, pets(name, species)').eq('user_id', userId).in('status', ['pending', 'pendiente', 'Pendiente', 'PENDING']).order('created_at', { ascending: false })
  return data || []
}

async function getMyRequests(supabase: any, userId: string) {
  const client = getAdminClient(supabase)
  const { data } = await client.from('adoption_requests').select('status, created_at, pets(name, species)').eq('user_id', userId).order('created_at', { ascending: false })
  return data || []
}

async function getAllPendingRequests(supabase: any) {
  const client = getAdminClient(supabase)
  const { data, error } = await client.from('adoption_requests').select('status, created_at, profiles(full_name), pets(name)').in('status', ['pending', 'pendiente', 'Pendiente', 'PENDING']).order('created_at', { ascending: false })
  if (error) console.error("SUPABASE ERROR in getAllPendingRequests:", error)
  return data || []
}

async function getAllRequests(supabase: any) {
  const client = getAdminClient(supabase)
  const { data, error } = await client.from('adoption_requests').select('status, created_at, profiles(full_name), pets(name)').order('created_at', { ascending: false }).limit(10)
  if (error) console.error("SUPABASE ERROR in getAllRequests:", error)
  return data || []
}

async function getPets(supabase: any, scope: string) {
  const client = getAdminClient(supabase)
  let query = client.from('pets').select('name, species, breed, age, description, status')
  if (scope === 'disponibles') query = query.eq('status', 'disponible')
  const { data } = await query.limit(10)
  return data || []
}

async function countPets(supabase: any, scope: string) {
  const client = getAdminClient(supabase)
  let query = client.from('pets').select('*', { count: 'exact', head: true })
  if (scope === 'disponibles') query = query.eq('status', 'disponible')
  const { count } = await query
  return { cantidad: count, tipo: scope }
}

async function getPetAttributes(supabase: any, scope: string, attributes: string) {
  const client = getAdminClient(supabase)
  let query = client.from('pets').select(attributes)
  if (scope === 'disponibles') query = query.eq('status', 'disponible')
  const { data } = await query.limit(20)
  return data || []
}

async function getPetsByBreed(supabase: any, breed: string) {
  const client = getAdminClient(supabase)
  const { data } = await client.from('pets').select('name, species, breed, age, status').ilike('breed', `%${breed}%`).limit(5)
  return data || []
}

async function getLastPet(supabase: any) {
  const client = getAdminClient(supabase)
  const { data } = await client.from('pets').select('name, species, breed, status, created_at').order('created_at', { ascending: false }).limit(1)
  return data || []
}

async function getFavorites(supabase: any, userId: string) {
  const client = getAdminClient(supabase)
  console.log("FAVORITES userId:", userId)
  const { data, error } = await client
    .from('favorites')
    .select('pet_id, created_at, pets(id, name, species, breed, age, description, status)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  console.log("FAVORITES raw:", data)
  console.log("FAVORITES error:", error)

  const pets = data?.map((f: any) => f.pets).filter(Boolean) || []
  console.log("FAVORITES pets:", pets)
  return pets;
}

async function getNotifications(supabase: any, userId: string) {
  const client = getAdminClient(supabase)
  const { data } = await client.from('notifications').select('title, message, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
  return data || []
}

async function getSystemSummary(supabase: any) {
  const client = getAdminClient(supabase)
  const { count: cPets } = await client.from('pets').select('*', { count: 'exact', head: true })
  const { count: cDisp } = await client.from('pets').select('*', { count: 'exact', head: true }).eq('status', 'disponible')
  const { count: cAdopt } = await client.from('pets').select('*', { count: 'exact', head: true }).eq('status', 'adoptado')
  const { count: cReqs } = await client.from('adoption_requests').select('*', { count: 'exact', head: true }).in('status', ['pending', 'pendiente', 'Pendiente', 'PENDING'])
  const { count: cUsers } = await client.from('profiles').select('*', { count: 'exact', head: true })
  const { data: logs } = await client.from('operation_logs').select('operation_type, created_at').order('created_at', { ascending: false }).limit(3)
  
  return { total_mascotas: cPets, disponibles: cDisp, adoptadas: cAdopt, solicitudes_pendientes: cReqs, usuarios_registrados: cUsers, ultimas_operaciones: logs }
}

async function getRecentActivity(supabase: any) {
  const client = getAdminClient(supabase)
  const { data } = await client.from('operation_logs').select('operation_type, metadata, created_at').order('created_at', { ascending: false }).limit(5)
  return data || []
}

// ============================================================================
// 2. UTILIDADES DE CHAT Y LOGS
// ============================================================================

async function insertChatMessage(supabase: any, {
  userId, role, content, conversationId, sender, metadata = {}
}: {
  userId: string, role: 'user' | 'assistant', content: string, conversationId?: string, sender?: string, metadata?: any
}) {
  const client = getAdminClient(supabase)
  // Guardamos todo de forma limpia serializado en 'content' para compatibilidad total con el esquema de Supabase
  const adaptedContent = JSON.stringify({
    conversation_id: conversationId,
    sender,
    text: content,
    metadata
  })
  
  await client.from('chat_messages').insert({
    user_id: userId,
    role,
    content: adaptedContent
  })
}

async function getConversationContext(supabase: any, conversationId: string, userId: string) {
  const client = getAdminClient(supabase)
  const { data } = await client
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data || data.length === 0) return "Sin contexto previo."

  const filtered = []
  for (const row of data) {
    if (row.content && row.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(row.content)
        if (parsed.conversation_id === conversationId) {
          filtered.push({ role: row.role, text: parsed.text || '' })
        }
      } catch {}
    } else {
      // Ignorar o añadir mensajes de texto plano antiguos
    }
    if (filtered.length >= 4) break
  }

  if (filtered.length === 0) return "Sin contexto previo."
  return filtered.reverse().map((row: any) => {
    return `${row.role === 'user' ? 'Usuario' : 'Asistente'}: ${row.text}`
  }).join('\n')
}

async function getLastAssistantMessage(supabase: any, conversationId: string, userId: string) {
  const client = getAdminClient(supabase)
  const { data } = await client
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5)
    
  if (!data) return null
  
  for (const row of data) {
    if (row.content && row.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(row.content)
        if (parsed.conversation_id === conversationId && row.role === 'assistant') {
          return { content: parsed.text, metadata: parsed.metadata }
        }
      } catch {}
    }
  }
  return null
}

async function logOperationAndVector(supabase: any, userId: string, role: string, action: string, description: string, recordId: string, tableName: string) {
  const client = getAdminClient(supabase)
  await client.from('operation_logs').insert({ user_id: userId, operation_type: action, metadata: { description, record_id: recordId, table_name: tableName, role } })
  const embedding = generateEmbedding(description)
  const { error } = await client.from('vector_logs').insert({
    user_id: userId, role, operation_type: 'insert_record', query_text: description, embedding: vectorToString(embedding), table_name: tableName, record_id: recordId, content: description
  })
  if (error && error.code === '42703') {
    await client.from('vector_logs').insert({ user_id: userId, operation_type: 'insert_record', query_text: description, results_count: 1 })
  }
}

// ============================================================================
// 3. GROQ LLM INTEGRATION
// ============================================================================

async function classifyUserMessage(message: string, role: string, history: string) {
  const lowercaseMsg = message.toLowerCase().trim()
  
  // Pre-clasificación por Regex de alta prioridad
  if (lowercaseMsg.includes('favorito') || lowercaseMsg.includes('favoritos') || lowercaseMsg.includes('mis fav')) {
    return {
      action: 'consultar_mis_favoritos',
      needs_confirmation: false,
      context: { topic: 'favorites', scope: null },
      parameters: {}
    }
  }

  if (lowercaseMsg.includes('solicitud') || lowercaseMsg.includes('solicitudes')) {
    const isPending = lowercaseMsg.includes('pendiente') || lowercaseMsg.includes('espera') || lowercaseMsg.includes('proceso') || lowercaseMsg.includes('nueva') || lowercaseMsg.includes('nuevas')
    return {
      action: isPending ? 'consultar_mis_solicitudes_pendientes' : 'consultar_mis_solicitudes',
      needs_confirmation: false,
      context: { topic: 'requests', scope: isPending ? 'pendientes' : null },
      parameters: {}
    }
  }

  if (!GROQ_API_KEY) return { action: 'respuesta_general', context: {}, parameters: {} }
  
  const prompt = `
    Analiza este mensaje del usuario (Rol: ${role}), basándote en el historial reciente para entender el contexto.
    
    --- Historial Reciente ---
    ${history}
    --------------------------

    Clasifica el ÚLTIMO MENSAJE estrictamente en UNA de estas acciones permitidas:
    - contar_mascotas
    - listar_mascotas
    - listar_razas_mascotas
    - listar_edades_mascotas
    - listar_mascotas_disponibles
    - buscar_mascota_por_raza
    - recomendacion_general
    - consultar_mis_solicitudes
    - consultar_mis_solicitudes_pendientes
    - consultar_solicitudes_globales
    - consultar_solicitudes_pendientes_globales
    - consultar_mis_favoritos
    - consultar_mis_notificaciones
    - ultima_mascota_registrada
    - resumen_sistema
    - actividad_reciente
    - registrar_mascota
    - confirmar_accion
    - cancelar_accion
    - respuesta_general

    Mensaje actual: "${message}"

    Extrae también el TÓPICO y el ALCANCE (scope).
    - topic puede ser: "pets", "requests", "favorites", "notifications", "system", o null.
    - scope puede ser: "registradas" (todas), "disponibles" (solo las que están para adopción), "pendientes", o null.

    Responde ÚNICAMENTE con este JSON válido:
    {
      "action": "...",
      "needs_confirmation": false,
      "context": {
        "topic": "pets",
        "scope": "registradas"
      },
      "parameters": {
        "breed": "nombre exacto de la raza si aplica, sino vacío",
        "name": "nombre si aplica, sino vacío",
        "species": "especie si aplica, sino vacío"
      }
    }
  `

  let res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: 'user', content: prompt }], temperature: 0.1, response_format: { type: "json_object" } })
  })
  
  if (!res.ok) {
    console.warn(`Groq 70B failed with status ${res.status}. Falling back to 8B instant model...`)
    res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: 'user', content: prompt }], temperature: 0.1, response_format: { type: "json_object" } })
    })
  }

  if (!res.ok) return { action: 'respuesta_general', context: {}, parameters: {} }
  try {
    const data = await res.json()
    return JSON.parse(data.choices?.[0]?.message?.content || "{}")
  } catch {
    return { action: 'respuesta_general', context: {}, parameters: {} }
  }
}

async function callGroqText(prompt: string) {
  if (!GROQ_API_KEY) return "⚠️ Groq API Key no configurada."
  let res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
  })
  
  if (!res.ok) {
    console.warn(`Groq 70B failed with status ${res.status}. Falling back to 8B instant model...`)
    res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
    })
  }

  if (!res.ok) return "Lo siento, tuve un problema conectándome a los servidores de IA."
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ""
}

// ============================================================================
// 4. MAIN ENDPOINT
// ============================================================================

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { message, role: rawRole, name, conversation_id } = body
  const user_id = user.id // Forzamos el user_id real del token JWT
  
  if (!message || !conversation_id) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  let { data: profile } = await supabase.from('profiles').select('role').eq('id', user_id).single()
  const userMetadataRole = user.user_metadata?.role || user.user_metadata?.raw_user_meta_data?.role
  const resolvedAdmin = profile?.role === 'admin' || rawRole === 'admin' || userMetadataRole === 'admin'
  const role = resolvedAdmin ? 'admin' : 'cliente'

  // Autorreparador de perfiles: Sincroniza / Crea el perfil físicamente en la BD si no existe o está desactualizado
  try {
    const adminClient = getAdminClient(supabase)
    const displayName = name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario'
    if (!profile) {
      console.log("BASE DE DATOS SINC: Creando perfil faltante en Supabase...")
      await adminClient.from('profiles').insert({
        id: user_id,
        full_name: displayName,
        role: role
      })
      console.log("BASE DE DATOS SINC: Perfil creado con éxito:", { id: user_id, role })
    } else if (profile.role !== role) {
      console.log("BASE DE DATOS SINC: Sincronizando rol desactualizado a:", role)
      await adminClient.from('profiles').update({ role }).eq('id', user_id)
      console.log("BASE DE DATOS SINC: Rol sincronizado con éxito.")
    }
  } catch (syncErr) {
    console.error("Error en sincronización automática de perfiles:", syncErr)
  }

  // Log: recepción de mensaje
  console.log("MENSAJE:", message)
  console.log("USUARIO:", {
    userId: user_id,
    role,
    conversationId: conversation_id
  })

  await insertChatMessage(supabase, { userId: user_id, role: 'user', content: message, conversationId: conversation_id, sender: name })

  try {
    const lastMsg = await getLastAssistantMessage(supabase, conversation_id, user_id)
    const chatHistory = await getConversationContext(supabase, conversation_id, user_id)
    const lastContext = lastMsg?.metadata?.context || {}
    
    const msgLower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

    if (role === 'admin') {
      const adminClient = getAdminClient(supabase)
      
      const isQuantHeIngresado = msgLower.match(/cuant[ao]s?\s+(?:registros?|mascotas?)?\s*(?:he\s+ingresado|ingrese|he\s+registrado|registre|he\s+subido|subi)/i) || 
                                 (msgLower.match(/cuant[ao]s?\s+(?:registros?|mascotas?)\s+(?:tengo|he\s+hecho)/i));
      
      const isMyLastRecords = msgLower.match(/(?:cuales\s+son\s+)?mis\s+ultimos?\s+(?:registros?|mascotas?)/i) || 
                              msgLower.match(/ultimos?\s+(?:registros?|mascotas?)\s+(?:que\s+)?(?:ingrese|he\s+ingresado|registre|he\s+registrado)/i);
      
      const isSimilarDescription = msgLower.match(/(?:que\s+)?(?:registros?|mascotas?)\s+(?:son\s+)?(?:similares?|parecidos?)\s+a/i) || 
                                   msgLower.match(/(?:buscar|encuentra|ver)\s+(?:registros?|mascotas?)\s+(?:similares?|parecidos?)/i) ||
                                   msgLower.match(/(?:similares?|parecidos?)\s+a\s+esta\s+descripcion/i);
      
      const isLastStoredRecord = msgLower.match(/ultimo\s+registro\s+(?:almacenado|guardado|ingresado|registrado|creado|existente|del\s+sistema)/i) || 
                                 msgLower.match(/cual\s+(?:fue\s+)?el\s+ultimo\s+(?:registro|mascota)\s+(?:almacenado|guardado|ingresado|registrado|creado)/i) ||
                                 (msgLower.match(/ultimo\s+(?:registro|mascota)/i) && !msgLower.includes('mis') && !msgLower.includes('mi'));
      
      const isSystemErrors = msgLower.match(/(?:que\s+)?errores?\s+(?:se\s+han\s+presentado|hay|existen|ocurrieron|ocurrido|registrados?|del\s+sistema)/i) || 
                             msgLower.match(/fallos?\s+(?:del\s+sistema|presentados?)/i);
      
      const isAvgInsertionTime = msgLower.match(/tiempo\s+promedio\s+(?:de\s+)?(?:insercion|registro|ingreso|guardado)/i) || 
                                 msgLower.match(/latencia\s+promedio\s+(?:de\s+)?(?:insercion|registro|ingreso|guardado)/i) ||
                                 msgLower.match(/promedio\s+de\s+(?:tiempo|latencia)\s+(?:de\s+)?(?:insercion|registro|ingreso|guardado)/i);
      
      const isUserWithMostRecords = msgLower.match(/usuario\s+(?:que\s+)?(?:ha\s+ingresado|ingreso|tiene|ha\s+registrado|registro)\s+mas\s+(?:registros|mascotas)/i) || 
                                    msgLower.match(/quien\s+(?:ha\s+ingresado|ingreso|tiene|ha\s+registrado|registro)\s+mas\s+(?:registros|mascotas)/i) ||
                                    msgLower.match(/usuario\s+con\s+mas\s+(?:registros|mascotas)/i) ||
                                    msgLower.match(/top\s+usuario\s+(?:con\s+)?(?:mas\s+)?(?:registros|mascotas)/i);
      
      const isWhatCanWeGetFromMetrics = msgLower.match(/(?:que\s+)?(?:podemos\s+sacar|se\s+puede\s+obtener|informacion\s+hay|obtener)\s+(?:de\s+)?(?:las\s+)?metricas/i) || 
                                         msgLower.match(/cuales\s+son\s+las\s+metricas/i) || 
                                         msgLower.match(/ver\s+metricas/i) ||
                                         msgLower.match(/^metricas$/i);

      let responseText = ''

      if (isQuantHeIngresado) {
        const { count, error } = await adminClient
          .from('pets')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user_id)
        
        if (error) {
          responseText = `❌ Error al consultar tus registros: ${error.message}`
        } else {
          responseText = `📊 Has ingresado un total de **${count ?? 0} registros** (mascotas) en el sistema.`
        }
      } 
      else if (isMyLastRecords) {
        const { data: pets, error } = await adminClient
          .from('pets')
          .select('name, species, breed, status, created_at')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
          .limit(5)
        
        if (error) {
          responseText = `❌ Error al obtener tus últimos registros: ${error.message}`
        } else if (!pets || pets.length === 0) {
          responseText = `📭 No tienes ningún registro ingresado en el sistema todavía.`
        } else {
          const list = pets.map((p: any, i: number) => 
            `${i + 1}. **${p.name}** (${p.species}${p.breed ? ` - ${p.breed}` : ''}) — *${p.status}* — ${new Date(p.created_at).toLocaleDateString('es-MX')}`
          ).join('\n')
          responseText = `🐾 **Tus últimos registros en el sistema son:**\n\n${list}`
        }
      } 
      else if (isSimilarDescription) {
        let queryText = message;
        const simMatch = msgLower.match(/(?:similar(?:es)?\s+a\s+esta\s+descripcion|similar(?:es)?\s+a)\s*:?\s*(.*)/i);
        if (simMatch && simMatch[1]?.trim()) {
          queryText = message.substring(message.toLowerCase().indexOf(simMatch[1].trim()));
        }
        
        try {
          const embeddingVec = generateEmbedding(queryText)
          const { data: results, error } = await adminClient.rpc('search_similar_pets', {
            query_embedding: vectorToString(embeddingVec),
            match_threshold: 0.1,
            match_count: 5
          })
          
          if (error) {
            responseText = `❌ Error en búsqueda semántica: ${error.message}`
          } else if (!results || results.length === 0) {
            responseText = `🔍 No se encontraron registros similares a la descripción: "${queryText}".`
          } else {
            const list = results.map((r: any, i: number) => 
              `${i + 1}. **${r.name}** (${r.species}${r.breed ? ` - ${r.breed}` : ''}) — Similitud: **${(r.similarity * 100).toFixed(0)}%**\n   _${r.description}_`
            ).join('\n\n')
            responseText = `🔍 **Registros similares encontrados para "${queryText}":**\n\n${list}`
          }
        } catch (embErr: any) {
          responseText = `❌ Ocurrió un problema al procesar la búsqueda vectorial: ${embErr.message}`
        }
      } 
      else if (isLastStoredRecord) {
        const { data: pets, error } = await adminClient
          .from('pets')
          .select('name, species, breed, status, created_at, profiles(full_name)')
          .order('created_at', { ascending: false })
          .limit(1)
        
        if (error) {
          responseText = `❌ Error al consultar el último registro: ${error.message}`
        } else if (!pets || pets.length === 0) {
          responseText = `📭 No hay ningún registro guardado en el sistema todavía.`
        } else {
          const p = pets[0]
          const creator = (p.profiles as any)?.full_name || 'Desconocido'
          responseText = `🐾 **El último registro almacenado en el sistema es:**\n\n- **Nombre:** ${p.name}\n- **Especie:** ${p.species}\n- **Raza:** ${p.breed || 'No especificada'}\n- **Estado:** *${p.status}*\n- **Ingresado por:** ${creator}\n- **Fecha:** ${new Date(p.created_at).toLocaleString('es-MX')}`
        }
      } 
      else if (isSystemErrors) {
        const { data: errors, error } = await adminClient
          .from('operation_logs')
          .select('operation_type, error_message, created_at')
          .eq('success', false)
          .order('created_at', { ascending: false })
          .limit(5)
        
        if (error) {
          responseText = `❌ Error al consultar los errores: ${error.message}`
        } else if (!errors || errors.length === 0) {
          responseText = `✅ **¡Excelente! No se han presentado errores en el sistema.**`
        } else {
          const list = errors.map((e: any, i: number) => 
            `${i + 1}. **${e.operation_type}** — ${e.error_message || 'Error no especificado'} — *${new Date(e.created_at).toLocaleString('es-MX')}*`
          ).join('\n')
          responseText = `⚠️ **Últimos errores presentados en el sistema:**\n\n${list}`
        }
      } 
      else if (isAvgInsertionTime) {
        const { data: logs, error } = await adminClient
          .from('operation_logs')
          .select('latency_ms')
          .eq('operation_type', 'insert_pet')
          .eq('success', true)
        
        if (error) {
          responseText = `❌ Error al calcular latencia: ${error.message}`
        } else {
          const validLogs = logs?.filter((l: any) => (l.latency_ms ?? 0) > 0) || []
          const avg = validLogs.length 
            ? validLogs.reduce((s: number, l: any) => s + (l.latency_ms ?? 0), 0) / validLogs.length 
            : 0
          responseText = `⚡ **El tiempo promedio de inserción en el sistema es:** ${avg.toFixed(2)} ms (basado en ${validLogs.length} operaciones exitosas).`
        }
      } 
      else if (isUserWithMostRecords) {
        const { data: pets, error } = await adminClient
          .from('pets')
          .select('user_id, profiles(full_name)')
        
        if (error) {
          responseText = `❌ Error al obtener estadísticas de usuarios: ${error.message}`
        } else if (!pets || pets.length === 0) {
          responseText = `📭 No hay registros en el sistema.`
        } else {
          const counts: Record<string, { name: string; count: number }> = {}
          for (const p of pets) {
            const uid = p.user_id ?? 'unknown'
            const name = (p.profiles as any)?.full_name || 'Usuario Desconocido'
            counts[uid] = { name, count: (counts[uid]?.count ?? 0) + 1 }
          }
          const sorted = Object.values(counts).sort((a, b) => b.count - a.count)
          const top = sorted[0]
          
          if (!top) {
            responseText = `📭 No se pudo determinar el usuario con más registros.`
          } else {
            responseText = `🏆 El usuario que ha ingresado más registros en el sistema es **${top.name}** con **${top.count} mascotas**.`
          }
        }
      }
      else if (isWhatCanWeGetFromMetrics) {
        try {
          const metrics = await getSystemMetrics()
          responseText = `📊 **Métricas del Sistema PetAdopt**\n\nAquí tienes la información clave extraída directamente de la base de datos:\n\n` +
            `- 🐾 **Total de Mascotas:** **${metrics.totalRecords}**\n` +
            `- 🟢 **Disponibles:** **${metrics.availablePets}** | 🔴 **Adoptadas:** **${metrics.adoptedPets}**\n` +
            `- 👥 **Total de Usuarios:** **${metrics.totalUsers}**\n` +
            `- ⚡ **Tiempo Promedio Inserción:** **${metrics.avgInsertLatency} ms**\n` +
            `- ✅ **Tasa Éxito Inserción:** **${metrics.insertSuccessRate}%**\n` +
            `- ⚠️ **Errores Registrados:** **${metrics.insertErrors}**\n` +
            `- 💬 **Consultas de Chat:** **${metrics.totalChatQueries}**\n` +
            `- 🔍 **Tiempo Búsqueda Semántica:** **${metrics.avgQueryLatency} ms**\n` +
            `- 🔗 **Mascotas Vectorizadas:** **${metrics.vectorStorageInfo.count}** (Dim: ${metrics.vectorStorageInfo.dimensions})\n\n` +
            `💡 *Estas métricas te permiten monitorear la salud técnica y operativa del sistema en tiempo real.*`
        } catch (metErr: any) {
          responseText = `❌ Error al obtener las métricas generales: ${metErr.message}`
        }
      }

      if (responseText) {
        await adminClient.from('operation_logs').insert({ 
          user_id, 
          operation_type: `consulta_admin_directa`, 
          metadata: { query: message, matched: true, role } 
        })
        
        await insertChatMessage(supabase, { 
          userId: user_id, 
          role: 'assistant', 
          content: responseText, 
          conversationId: conversation_id, 
          sender: 'PetBot',
          metadata: { context: { detected_action: 'consulta_admin_directa', topic: 'metrics' } }
        })
        
        return NextResponse.json({ response: responseText })
      }
    }

    const classResult = await classifyUserMessage(message, role, chatHistory)
    let action = classResult.action
    let params = classResult.parameters || {}
    let scope = classResult.context?.scope
    let topic = classResult.context?.topic
    
    let pendingAction = lastMsg?.metadata?.pending_action

    // Logs obligatorios (Tarea 11 & Depuración)
    console.log("INTENCION:", action)
    console.log("CONTEXTO:", lastContext)
    console.log("PENDING ACTION:", pendingAction)

    // ------------------------------------------------------------------------
    // RESOLUCIÓN DE AMBIGÜEDAD DE CONTEXTO (Regla 11 y 17)
    // ------------------------------------------------------------------------
    if (action === 'listar_razas_mascotas' || action === 'listar_edades_mascotas' || action === 'listar_mascotas') {
      if (!scope && lastContext.topic === 'pets') {
        scope = lastContext.scope // Heredar scope si es ambiguo (ej: "qué raza son", "cuales son")
      }
      
      if (!scope || (scope !== 'registradas' && scope !== 'disponibles')) {
        const responseText = "¿Te refieres a las mascotas registradas, disponibles, solicitudes o favoritos?"
        await insertChatMessage(supabase, { userId: user_id, role: 'assistant', content: responseText, conversationId: conversation_id, sender: 'PetBot', metadata: { context: { topic: 'pets' } } })
        return NextResponse.json({ response: responseText })
      }
    }
    
    if (action === 'contar_mascotas' && !scope) scope = 'registradas'
    if (action === 'listar_mascotas_disponibles') scope = 'disponibles'

    let responseText = ''
    let dbData: any = null
    // ------------------------------------------------------------------------
    // MODO CONFIRMACIÓN DE ACCIÓN PENDIENTE (Tareas 2, 3, 4, 6, 9, 10)
    // ------------------------------------------------------------------------
    if (pendingAction && (action === 'confirmar_accion' || action === 'cancelar_accion' || message.toLowerCase().match(/s[ií]|claro|confirm|correcto|acepto|no|cancel/))) {
      const isConfirming = action === 'confirmar_accion' || message.toLowerCase().match(/s[ií]|claro|por supuesto|dale|ok|acepto|confirm|correcto/)
      
      if (isConfirming) {
        if (pendingAction.type === 'registrar_mascota') {
          if (role !== 'admin') {
            responseText = 'No tienes permisos para registrar mascotas.'
          } else {
            const p = pendingAction.data
            
            // Tarea 2: Normalización robusta para evitar violación de restricción check de especies y estados
            let normalizedSpecies = (p.especie || 'perro').toLowerCase().trim()
            if (normalizedSpecies === 'dog' || normalizedSpecies.includes('perr')) normalizedSpecies = 'perro'
            else if (normalizedSpecies === 'cat' || normalizedSpecies.includes('gat')) normalizedSpecies = 'gato'
            else if (normalizedSpecies.includes('conej')) normalizedSpecies = 'conejo'
            else if (normalizedSpecies.includes('pajar') || normalizedSpecies.includes('ave') || normalizedSpecies.includes('páj')) normalizedSpecies = 'ave'
            else if (!['perro', 'gato', 'conejo', 'ave', 'otro'].includes(normalizedSpecies)) normalizedSpecies = 'otro'

            let normalizedStatus = (p.estado || 'disponible').toLowerCase().trim()
            if (normalizedStatus === 'disponible' || normalizedStatus === 'available') normalizedStatus = 'disponible'
            else if (normalizedStatus.includes('proces') || normalizedStatus.includes('pending')) normalizedStatus = 'en_proceso'
            else if (normalizedStatus.includes('adopt') || normalizedStatus.includes('taken')) normalizedStatus = 'adoptado'
            else normalizedStatus = 'disponible'

            const insertPayload = {
              name: p.nombre,
              species: normalizedSpecies,
              breed: p.raza || '',
              age: parseInt(p.edad) || 0,
              description: p.descripcion || `Mascota ${p.nombre}, registrada vía chat.`,
              status: normalizedStatus,
              user_id: user_id
            }
            console.log("SUPABASE QUERY: Insert pet payload", insertPayload);
            
            const adminClient = getAdminClient(supabase)
            const { data: pet, error } = await adminClient.from('pets').insert([insertPayload]).select().single()
            
            console.log("SUPABASE RESULT:", pet);
            console.log("SUPABASE ERROR:", error);

            if (error) {
              console.error("Error insertando mascota:", error);
              responseText = `No pude registrar la mascota. Error: ${error.message || error.code}`
            } else {
              responseText = `Listo, registré a ${p.nombre} correctamente.`
              await logOperationAndVector(supabase, user_id, role, 'registrar_mascota', `Admin registró la mascota ${p.nombre}. Mascota ${p.nombre}, especie ${normalizedSpecies}, raza ${p.raza || 'desconocida'}, edad ${p.edad || 0} años, estado ${normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)}, registrada por Admin.`, pet.id, 'pets')
            }
          }
        } else {
          responseText = 'No encontré una acción pendiente para confirmar. Indícame nuevamente qué deseas hacer.'
        }
      } else {
        responseText = `Registro cancelado.`
      }
      
      await insertChatMessage(supabase, { userId: user_id, role: 'assistant', content: responseText, conversationId: conversation_id, sender: 'PetBot' })
      return NextResponse.json({ response: responseText })
    }

    // ------------------------------------------------------------------------
    // PROCESAR INTENCIONES NUEVAS
    // ------------------------------------------------------------------------
    if (action === 'registrar_mascota') {
      if (role !== 'admin') {
        responseText = 'No tienes permisos para registrar mascotas.'
        await insertChatMessage(supabase, { userId: user_id, role: 'assistant', content: responseText, conversationId: conversation_id, sender: 'PetBot' })
        return NextResponse.json({ response: responseText })
      } else if (!params.name) {
        responseText = 'Para registrar una mascota necesito al menos el **nombre**. ¿Cómo se llama?'
        await insertChatMessage(supabase, { userId: user_id, role: 'assistant', content: responseText, conversationId: conversation_id, sender: 'PetBot' })
        return NextResponse.json({ response: responseText })
      } else {
        // Tarea 3: Extractor robusto de edad usando patrones específicos obligatorios
        let finalAge = 0;
        const ageMatchAnos = message.match(/(\d+)\s*años?/i);
        if (ageMatchAnos && ageMatchAnos[1]) {
          finalAge = parseInt(ageMatchAnos[1]);
        } else {
          const ageMatchTiene = message.match(/(?:tiene|edad)\s*(\d+)/i);
          if (ageMatchTiene && ageMatchTiene[1]) {
            finalAge = parseInt(ageMatchTiene[1]);
          } else if (params.age) {
            finalAge = parseInt(params.age);
          }
        }

        const petData = { nombre: params.name, especie: params.species || 'perro', raza: params.breed || 'desconocida', edad: finalAge, estado: 'Disponible', descripcion: '' }
        responseText = `Detecté estos datos:\nNombre: ${petData.nombre}\nEspecie: ${petData.especie}\nRaza: ${petData.raza}\nEdad: ${petData.edad} años\nEstado: ${petData.estado}\n\n¿Confirmas que deseas registrar esta mascota?`
        const newPendingAction = { type: 'registrar_mascota', data: petData }
        await insertChatMessage(supabase, { userId: user_id, role: 'assistant', content: responseText, conversationId: conversation_id, sender: 'PetBot', metadata: { pending_action: newPendingAction } })
        return NextResponse.json({ response: responseText })
      }
    } else if (action === 'respuesta_general' || action === 'recomendacion_general') {
      responseText = await callGroqText(
        `Eres PetBot, asistente de PetAdopt. Responde de forma directa, natural y conversacional a esta consulta: "${message}". 
        NO saludes, no digas "hola" ni te presentes de nuevo a menos que el usuario esté saludando explícitamente en su mensaje.
        
        Historial reciente de chat para contexto:
        ${chatHistory}`
      )
    } else {
      
      const adminClient = getAdminClient(supabase)

      // Acciones de Mascotas
      if (action === 'contar_mascotas') {
        console.log("SUPABASE QUERY:", `countPets scope=${scope}`)
        const { count, error } = await adminClient.from('pets').select('*', { count: 'exact', head: true }).eq('status', scope === 'disponibles' ? 'disponible' : undefined)
        console.log("SUPABASE RESULT:", count)
        console.log("SUPABASE ERROR:", error)
        dbData = { cantidad: count, tipo: scope }
      }
      else if (action === 'listar_mascotas' || action === 'listar_mascotas_disponibles') {
        console.log("SUPABASE QUERY:", `getPets scope=${scope}`)
        let q = adminClient.from('pets').select('name, species, breed, age, description, status')
        if (scope === 'disponibles') q = q.eq('status', 'disponible')
        const { data, error } = await q.limit(10)
        console.log("SUPABASE RESULT:", data)
        console.log("SUPABASE ERROR:", error)
        dbData = data
      }
      else if (action === 'listar_razas_mascotas') {
        console.log("SUPABASE QUERY:", `getPetAttributes scope=${scope}`)
        let q = adminClient.from('pets').select('name, breed')
        if (scope === 'disponibles') q = q.eq('status', 'disponible')
        const { data, error } = await q.limit(20)
        console.log("SUPABASE RESULT:", data)
        console.log("SUPABASE ERROR:", error)
        dbData = data
      }
      else if (action === 'listar_edades_mascotas') {
        console.log("SUPABASE QUERY:", `getPetAttributes scope=${scope}`)
        let q = adminClient.from('pets').select('name, age')
        if (scope === 'disponibles') q = q.eq('status', 'disponible')
        const { data, error } = await q.limit(20)
        console.log("SUPABASE RESULT:", data)
        console.log("SUPABASE ERROR:", error)
        dbData = data
      }
      else if (action === 'buscar_mascota_por_raza') {
        console.log("SUPABASE QUERY:", `getPetsByBreed breed=${params.breed}`)
        const { data, error } = await adminClient.from('pets').select('name, species, breed, age, status').ilike('breed', `%${params.breed || ''}%`).limit(5)
        console.log("SUPABASE RESULT:", data)
        console.log("SUPABASE ERROR:", error)
        dbData = data
      }
      else if (action === 'ultima_mascota_registrada') {
        console.log("SUPABASE QUERY:", `getLastPet`)
        const { data, error } = await adminClient.from('pets').select('name, species, breed, status, created_at').order('created_at', { ascending: false }).limit(1)
        console.log("SUPABASE RESULT:", data)
        console.log("SUPABASE ERROR:", error)
        dbData = data
      }
      
      // Acciones de Usuario / Generales
      else if (action === 'consultar_mis_solicitudes_pendientes') {
        if (role === 'admin') {
          console.log("SUPABASE QUERY: Admin querying global pending requests")
          dbData = await getAllPendingRequests(supabase)
        } else {
          console.log("SUPABASE QUERY:", `getMyPendingRequests user_id=${user_id}`)
          const { data, error } = await adminClient.from('adoption_requests').select('status, created_at, pets(name, species)').eq('user_id', user_id).in('status', ['pending', 'pendiente', 'Pendiente', 'PENDING']).order('created_at', { ascending: false })
          console.log("SUPABASE RESULT:", data)
          console.log("SUPABASE ERROR:", error)
          dbData = data
        }
      }
      else if (action === 'consultar_mis_solicitudes') {
        if (role === 'admin') {
          console.log("SUPABASE QUERY: Admin querying global requests")
          dbData = await getAllRequests(supabase)
        } else {
          console.log("SUPABASE QUERY:", `getMyRequests user_id=${user_id}`)
          const { data, error } = await adminClient.from('adoption_requests').select('status, created_at, pets(name, species)').eq('user_id', user_id).order('created_at', { ascending: false })
          console.log("SUPABASE RESULT:", data)
          console.log("SUPABASE ERROR:", error)
          dbData = data
        }
      }
      else if (action === 'consultar_mis_favoritos') {
        dbData = await getFavorites(supabase, user_id)
      }
      else if (action === 'consultar_mis_notificaciones') {
        console.log("SUPABASE QUERY:", `getNotifications user_id=${user_id}`)
        const { data, error } = await adminClient.from('notifications').select('title, message, created_at').eq('user_id', user_id).order('created_at', { ascending: false }).limit(5)
        console.log("SUPABASE RESULT:", data)
        console.log("SUPABASE ERROR:", error)
        dbData = data
      }
      
      // Acciones Admin Globales
      else if (['consultar_solicitudes_pendientes_globales', 'consultar_solicitudes_globales', 'resumen_sistema', 'actividad_reciente'].includes(action)) {
        if (role !== 'admin') {
          responseText = '❌ No tienes permisos para realizar esa acción.'
        } else {
          if (action === 'consultar_solicitudes_pendientes_globales') {
            console.log("SUPABASE QUERY:", `getAllPendingRequests`)
            const { data, error } = await adminClient.from('adoption_requests').select('status, created_at, profiles(full_name), pets(name)').in('status', ['pending', 'pendiente', 'Pendiente', 'PENDING']).order('created_at', { ascending: false })
            console.log("SUPABASE RESULT:", data)
            console.log("SUPABASE ERROR:", error)
            dbData = data
          }
          if (action === 'consultar_solicitudes_globales') {
            console.log("SUPABASE QUERY:", `getAllRequests`)
            const { data, error } = await adminClient.from('adoption_requests').select('status, created_at, profiles(full_name), pets(name)').order('created_at', { ascending: false }).limit(10)
            console.log("SUPABASE RESULT:", data)
            console.log("SUPABASE ERROR:", error)
            dbData = data
          }
          if (action === 'resumen_sistema') {
            console.log("SUPABASE QUERY: getSystemSummary")
            dbData = await getSystemSummary(supabase)
            console.log("SUPABASE RESULT:", dbData)
          }
          if (action === 'actividad_reciente') {
            console.log("SUPABASE QUERY: getRecentActivity")
            dbData = await getRecentActivity(supabase)
            console.log("SUPABASE RESULT:", dbData)
          }
        }
      }
      
      if (dbData !== null && !responseText) {
        const dataPrompt = `
          SYSTEM:
          Eres PetBot, un asistente de adopción de mascotas sumamente amigable, natural y conversacional. 
          
          REGLAS DE CONVERSACIÓN NATURAL (CRÍTICAS):
          1. **Evita la repetición de saludos mecánicos:** NO comiences cada mensaje con "¡Hola de nuevo!" o "Me alegra que hayas vuelto a preguntar". Si en el historial ya hubo un saludo inicial, ve DIRECTAMENTE al grano y responde la última pregunta de forma natural y fluida.
          2. **Sé dinámico y contextual:** NO uses siempre las mismas despedidas o firmas como "Espero que disfrutes viendo a tus amigos peludos favoritos". Adapta tus palabras al tema actual. Si el usuario te pregunta por gatos o aves generales en el sistema, no hables de "favoritos" ni asumas cosas personales.
          3. **Presentación de datos:** 
             - Si el "JSON DB" está vacío (ej: []), responde amigablemente de acuerdo al tema (ej: "No he encontrado ningún gatito por ahora", "No tienes favoritos guardados por ahora").
             - Si contiene datos, muéstralos de forma bonita e invita a la acción de forma variada e inteligente (ej: "¿Te gustaría adoptar a alguno?", "¿Quieres más información sobre alguno de ellos?").
          4. **Diferenciación de Roles (Admin vs Cliente - CRÍTICA):**
             - El usuario actual tiene el rol: "${role}".
             - Si el rol es "admin", compórtate estrictamente como un asistente de gestión administrativa: NO le sugieras al administrador "encontrar tus próximas mascotas favoritas" o "buscar mascotas para adoptar". En su lugar, infórmale de manera profesional sobre el estado de las solicitudes del sistema, mascotas registradas o confirma operaciones de registro.
             - Si el rol es "cliente", compórtate como un asistente para adoptantes: guíalo a encontrar mascotas, ver sus favoritos y consultar el estado de sus adopciones.

          INFORMACIÓN DE LA BASE DE DATOS (YA FILTRADA):
          El "JSON DB" que se te entrega ya ha sido filtrado estrictamente por el backend. Es seguro y le pertenece al usuario. No requieres un campo 'user_id' en los objetos para procesarlo.

          --- Historial de conversación ---
          ${chatHistory}
          ---------------------------------

          Si vas a listar mascotas, formatea de manera limpia y conversacional así:
          "Las mascotas encontradas son:" o "Tus mascotas favoritas son:" (según sea el caso)
          "- [Nombre]: [Especie], [Raza], [Estado]"

          USER:
          Última Pregunta: ${message}
          JSON DB: ${JSON.stringify(dbData)}
        `
        responseText = await callGroqText(dataPrompt)
        console.log("RESPUESTA GROQ:", responseText)
      }
    }

    if (!responseText) responseText = 'Lo siento, no pude procesar tu solicitud adecuadamente.'

    if (!['respuesta_general', 'recomendacion_general', 'confirmar_accion', 'cancelar_accion'].includes(action)) {
      const adminClient = getAdminClient(supabase)
      await adminClient.from('operation_logs').insert({ user_id, operation_type: `consulta_${action}`, metadata: { role } })
    }

    // Guardar nuevo contexto en metadata
    const newContext = { detected_action: action, topic: topic || lastContext.topic, scope: scope || lastContext.scope }
    await insertChatMessage(supabase, { userId: user_id, role: 'assistant', content: responseText, conversationId: conversation_id, sender: 'PetBot', metadata: { context: newContext } })

    return NextResponse.json({ response: responseText })
  } catch (error: any) {
    console.error('Error in AI Chat:', error)
    const errText = 'Lo siento, ocurrió un error procesando tu petición.'
    await insertChatMessage(supabase, { userId: user_id, role: 'assistant', content: errText, conversationId: conversation_id, sender: 'PetBot' })
    return NextResponse.json({ error: error.message, response: errText }, { status: 500 })
  }
}

// Fix hot-reload trigger
