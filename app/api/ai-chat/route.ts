import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding, vectorToString } from '@/lib/embeddings'

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
  const { data } = await client.from('adoption_requests').select('status, created_at, profiles(full_name), pets(name)').in('status', ['pending', 'pendiente', 'Pendiente', 'PENDING']).order('created_at', { ascending: false })
  return data || []
}

async function getAllRequests(supabase: any) {
  const client = getAdminClient(supabase)
  const { data } = await client.from('adoption_requests').select('status, created_at, profiles(full_name), pets(name)').order('created_at', { ascending: false }).limit(10)
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
  console.log("FAVORITES userId:", userId)
  const { data, error } = await supabase
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
    const isPending = lowercaseMsg.includes('pendiente') || lowercaseMsg.includes('espera') || lowercaseMsg.includes('proceso')
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

  const res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: 'user', content: prompt }], temperature: 0.1, response_format: { type: "json_object" } })
  })
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
  const res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
  })
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

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user_id).single()
  const role = profile?.role || rawRole || 'cliente'

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
      responseText = await callGroqText(`Eres PetBot, asistente del sistema PetAdopt. Responde de forma natural a esta consulta general: "${message}"`)
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
          Eres PetBot. Usa únicamente el JSON real entregado por el backend. 
          No inventes mascotas, favoritos, solicitudes, usuarios, estados ni cantidades. 
          Si el JSON está vacío, responde que no hay registros para esa consulta. 
          Si la pregunta es personal, usa solo datos filtrados por user_id.

          --- Historial de conversación ---
          ${chatHistory}
          ---------------------------------

          Si es una lista de razas o edades o nombres, formatea así:
          "Las mascotas ${scope || 'consultadas'} son:"
          "- [Nombre]: [Especie], [Raza], [Estado]"
          
          REGLA ESTRICTA DE PRIVACIDAD (IMPORTANTE):
          Si el usuario pregunta por 'mis favoritos', 'tengo favoritos', 'mis solicitudes', 'mis notificaciones' o cualquier dato personal, responde SOLO con los datos filtrados del usuario actual que vienen en el JSON DB. 
          Si el JSON DB está vacío o nulo para consultas personales, responde ÚNICAMENTE indicando eso (ej: "No tienes mascotas guardadas en favoritos por ahora."). BAJO NINGÚN CONCEPTO agregues texto como "sin embargo tienes una mascota en la base de datos" ni menciones otros registros globales.

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
