import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Dialogflow CX Webhook — POST /api/dialogflow-webhook
// Este endpoint es llamado por Dialogflow cuando el agente necesita datos reales de la DB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // El "tag" identifica qué tipo de consulta necesita Dialogflow
    const tag = body.fulfillmentInfo?.tag ?? ''
    const text = body.text ?? ''

    console.log('--- NUEVO LLAMADO DE DIALOGFLOW ---')
    console.log('1. Body completo recibido:', JSON.stringify(body, null, 2))
    console.log('2. Tag recibido:', tag)

    // Inicializar Supabase: si Dialogflow nos envía el access_token del usuario, lo usamos
    // para crear un cliente autenticado y cumplir con las políticas RLS.
    const accessToken = body.sessionInfo?.parameters?.access_token
    const userId = body.sessionInfo?.parameters?.user_id
    let supabase

    if (accessToken) {
      supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
          auth: {
            persistSession: false
          }
        }
      )
    } else {
      supabase = await createClient()
    }

    let responseText = ''

    // Tag: "ai_router" — Inteligencia Artificial para ruteo de consultas del sistema
    if (tag === 'ai_router') {
      const userMessage = body.text || body.transcript || body.queryResult?.text || body.sessionInfo?.parameters?.last_user_message || ''

      const params = body.sessionInfo?.parameters || {}
      const userId = params.user_id
      const email = params.email
      const role = params.role
      const name = params.name

      console.log('--- ROUTER INTELIGENTE DE DIALOGFLOW CX (AI ROUTER) ---')
      console.log('parámetros recibidos:', JSON.stringify(params, null, 2))
      console.log('user_id recibido:', userId)
      console.log('pregunta del usuario:', userMessage)

      const classificationPrompt = `Eres el clasificador de intención de PetAdopt. Analiza el mensaje del usuario y clasifícalo en una de estas acciones permitidas:
- contar_mascotas (si pregunta cuántas mascotas hay disponibles o en total)
- listar_mascotas (si pide ver la lista o qué mascotas hay disponibles)
- listar_razas (si pregunta qué razas están disponibles o qué razas hay)
- filtrar_perros (si pide ver o buscar perros disponibles)
- filtrar_gatos (si pide ver o buscar gatos disponibles)
- buscar_mascota_especifica (si pregunta por una mascota por su nombre o si hay una raza/especie específica, ej: "hay un beagle disponible?", "tienen algún husky?", "busca a Dex")
- crear_solicitud_adopcion (si expresa deseo de adoptar, ej: "quiero adoptar a Luna", "cómo adopto a Toby")
- ver_solicitudes (si pregunta "mis solicitudes" o por sus solicitudes de adopción en general)
- ver_solicitudes_pendientes (si pregunta específicamente si tiene alguna solicitud pendiente, ej: "tengo una solicitud pendiente?", "tengo solicitudes pendientes?")
- ver_favoritos (si pregunta por sus favoritos, ej: "tengo favoritos?", "mis favoritos")
- ver_notificaciones (si pregunta por sus notificaciones o alertas, ej: "mis notificaciones", "tengo notificaciones?")
- respuesta_general (para saludos, consejos, cuidados, qué raza recomiendas para departamento, etc.)

Responde estrictamente en formato JSON con la siguiente estructura:
{
  "action": "nombre_de_la_accion",
  "breed": "raza si se menciona, ej: 'beagle', de lo contrario null",
  "species": "especie si se menciona, ej: 'perro' o 'gato', de lo contrario null",
  "name": "nombre de la mascota si se menciona, ej: 'Dex', de lo contrario null"
}`

      let action = 'respuesta_general'
      let breedParam: string | null = null
      let speciesParam: string | null = null
      let nameParam: string | null = null

      const apiKey = process.env.GEMINI_API_KEY
      if (apiKey) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  { role: 'user', parts: [{ text: classificationPrompt }] },
                  { role: 'model', parts: [{ text: '¡Entendido! Responderé estrictamente en el formato JSON solicitado.' }] },
                  { role: 'user', parts: [{ text: userMessage }] }
                ],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.1,
                  maxOutputTokens: 200
                }
              })
            }
          )

          if (geminiRes.ok) {
            const data = await geminiRes.json()
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              const parsed = JSON.parse(text.trim())
              action = parsed.action || 'respuesta_general'
              breedParam = parsed.breed || null
              speciesParam = parsed.species || null
              nameParam = parsed.name || null
            }
          }
        } catch (err) {
          console.error('Error al clasificar con Gemini:', err)
        }
      }

      // Fallback si Gemini no está configurado o falló
      if (action === 'respuesta_general' && !apiKey) {
        const msg = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        if (msg.includes('beagle')) {
          action = 'buscar_mascota_especifica'
          breedParam = 'beagle'
        } else if (msg.includes('husky') || msg.includes('huski')) {
          action = 'buscar_mascota_especifica'
          breedParam = 'husky'
        } else if (msg.includes('labrador')) {
          action = 'buscar_mascota_especifica'
          breedParam = 'labrador'
        } else if (msg.includes('favorito')) {
          action = 'ver_favoritos'
        } else if (msg.includes('pendiente')) {
          action = 'ver_solicitudes_pendientes'
        } else if (msg.match(/(mis solicitud|mis adopt|solicitudes)/)) {
          action = 'ver_solicitudes'
        } else if (msg.match(/(cuant[ao]s?|numero|cantidad|total)\s+(mascota|perro|gato|animal|registro)/) || msg.match(/(disponibles?\s+hay|cuantos\s+hay)/) || msg === 'mascotas disponibles' || msg.includes('cuantos') || msg.includes('cuantas')) {
          action = 'contar_mascotas'
        } else if (msg.includes('perro') || msg.includes('canino') || msg.includes('🐕')) {
          action = 'filtrar_perros'
        } else if (msg.includes('gato') || msg.includes('felino') || msg.includes('🐈')) {
          action = 'filtrar_gatos'
        } else if (msg.match(/(raza|breed)/)) {
          action = 'listar_razas'
        } else if (msg.match(/(lista|catalogo|cuales|ver mascota|mostrar mascota|cuales hay|disponibles)/)) {
          action = 'listar_mascotas'
        } else if (msg.match(/(adoptar|adopcion|solicitud para)/)) {
          action = 'crear_solicitud_adopcion'
          const match = userMessage.match(/(?:adoptar a|adopcion de|adopcion para|solicitud para)\s+([A-ZÁÉÍÓÚa-záéíóú]+)/i)
          if (match?.[1]) nameParam = match[1]
        } else if (msg.match(/(informacion de|detalle|conoce a|descripcion de|sobre)\s+([A-ZÁÉÍÓÚa-záéíóú]+)/i)) {
          action = 'buscar_mascota_especifica'
          const match = userMessage.match(/(?:informacion de|detalle|conoce a|descripcion de|sobre)\s+([A-ZÁÉÍÓÚa-záéíóú]+)/i)
          if (match?.[2]) nameParam = match[2]
        } else if (msg.match(/(notificacion|alerta|aviso)/)) {
          action = 'ver_notificaciones'
        }
      }

      // Verificar autenticación para consultas personales
      const requiresAuth = ['ver_solicitudes', 'ver_solicitudes_pendientes', 'ver_favoritos', 'ver_notificaciones'].includes(action)
      if (requiresAuth && !userId) {
        const responseText = 'Necesito identificar tu usuario para consultar esa información.'
        console.log('tabla consultada: ninguna (requiere autenticación)')
        console.log('resultado de Supabase: ninguno')
        console.log('respuesta final:', responseText)

        return NextResponse.json({
          fulfillmentResponse: {
            messages: [{ text: { text: [responseText] } }]
          }
        })
      }

      let supabaseData: any = null
      let supabaseError: any = null
      let tableName = ''
      let filtersUsed: any = {}

      // Ejecutar la acción contra Supabase de manera segura
      if (action === 'contar_mascotas') {
        tableName = 'pets'
        filtersUsed = { status: 'disponible' }
        const { data, count, error } = await supabase
          .from('pets')
          .select('*', { count: 'exact' })
          .eq('status', 'disponible')
        
        supabaseData = { count, data }
        supabaseError = error
      }
      else if (action === 'listar_mascotas') {
        tableName = 'pets'
        filtersUsed = { status: 'disponible', limit: 8 }
        const { data, error } = await supabase
          .from('pets')
          .select('name, species, breed, age, description')
          .eq('status', 'disponible')
          .limit(8)
        
        supabaseData = data
        supabaseError = error
      }
      else if (action === 'listar_razas') {
        tableName = 'pets'
        filtersUsed = { status: 'disponible' }
        const { data, error } = await supabase
          .from('pets')
          .select('breed')
          .eq('status', 'disponible')
        
        supabaseData = data
        supabaseError = error
      }
      else if (action === 'filtrar_perros') {
        tableName = 'pets'
        filtersUsed = { status: 'disponible', species: 'perro', limit: 8 }
        const { data, error } = await supabase
          .from('pets')
          .select('name, breed, age, description')
          .eq('status', 'disponible')
          .eq('species', 'perro')
          .limit(8)
        
        supabaseData = data
        supabaseError = error
      }
      else if (action === 'filtrar_gatos') {
        tableName = 'pets'
        filtersUsed = { status: 'disponible', species: 'gato', limit: 8 }
        const { data, error } = await supabase
          .from('pets')
          .select('name, breed, age, description')
          .eq('status', 'disponible')
          .eq('species', 'gato')
          .limit(8)
        
        supabaseData = data
        supabaseError = error
      }
      else if (action === 'buscar_mascota_especifica') {
        tableName = 'pets'
        let query = supabase.from('pets').select('name, species, breed, age, description').eq('status', 'disponible')
        
        const filters: Record<string, string> = { status: 'disponible' }
        if (breedParam) {
          query = query.ilike('breed', `%${breedParam}%`)
          filters.breed = breedParam
        }
        if (speciesParam) {
          query = query.eq('species', speciesParam)
          filters.species = speciesParam
        }
        if (nameParam) {
          query = query.ilike('name', `%${nameParam}%`)
          filters.name = nameParam
        }

        filtersUsed = filters
        const { data, error } = await query
        supabaseData = data
        supabaseError = error
      }
      else if (action === 'crear_solicitud_adopcion') {
        tableName = 'ninguna'
        filtersUsed = { mascota: nameParam || 'cualquiera' }
        supabaseData = { instructivo: true }
      }
      else if (action === 'ver_solicitudes') {
        tableName = 'adoption_requests'
        filtersUsed = { user_id: userId, limit: 5 }
        const { data, error } = await supabase
          .from('adoption_requests')
          .select('status, pets(name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5)
        
        supabaseData = data
        supabaseError = error
      }
      else if (action === 'ver_solicitudes_pendientes') {
        tableName = 'adoption_requests'
        filtersUsed = { user_id: userId, status: 'pendiente', limit: 5 }
        const { data, error } = await supabase
          .from('adoption_requests')
          .select('status, pets(name)')
          .eq('user_id', userId)
          .eq('status', 'pendiente')
          .limit(5)
        
        supabaseData = data
        supabaseError = error
      }
      else if (action === 'ver_favoritos') {
        tableName = 'favorites'
        filtersUsed = { user_id: userId, limit: 5 }
        const { data, error } = await supabase
          .from('favorites')
          .select('pets(name, species, breed)')
          .eq('user_id', userId)
          .limit(5)
        
        supabaseData = data
        supabaseError = error
      }
      else if (action === 'ver_notificaciones') {
        tableName = 'notifications'
        filtersUsed = { user_id: userId, limit: 5 }
        const { data, error } = await supabase
          .from('notifications')
          .select('title, content')
          .eq('user_id', userId)
          .limit(5)
        
        supabaseData = data
        supabaseError = error
      }
      else {
        // respuesta_general: obtenemos contexto de mascotas disponibles para enriquecer la respuesta
        tableName = 'pets'
        filtersUsed = { status: 'disponible', limit: 5 }
        const { data, error } = await supabase
          .from('pets')
          .select('name, species, breed, age, description')
          .eq('status', 'disponible')
          .limit(5)
        
        supabaseData = data
        supabaseError = error
      }

      console.log('tabla consultada:', tableName)
      console.log('resultado de Supabase:', JSON.stringify(supabaseData, null, 2))

      let responseText = ''

      // Redactar la respuesta usando Gemini con blindaje contra alucinaciones si el API Key está presente
      if (apiKey) {
        try {
          const draftPrompt = `Eres el asistente virtual inteligente de PetAdopt, un sistema de adopción de mascotas.
Tu tarea es responder al mensaje del usuario de manera muy cálida, empática, clara y natural en español.

DATOS DEL USUARIO LOGUEADO:
- Nombre: ${name || 'Usuario'}
- Email: ${email || 'No proporcionado'}
- Rol: ${role || 'cliente'}

INSTRUCCIÓN CRÍTICA:
- Debes responder utilizando EXCLUSIVAMENTE los DATOS REALES obtenidos de Supabase que te proporcionamos abajo.
- NUNCA inventes nombres de mascotas, razas, cantidades, solicitudes ni estados que no aparezcan en los datos reales.
- Si te preguntan sobre favoritos, solicitudes, notificaciones, perfil o datos reales del sistema, usa únicamente los datos de Supabase que están abajo.
- Si no hay datos que coincidan con la búsqueda (por ejemplo, preguntan por favoritos pero no hay ninguno), explícalo amablemente y anímalos a guardar mascotas como favoritas o registrar solicitudes.
- Si preguntan sobre consejos generales, recomendaciones de departamento o cuidados, proporciona una respuesta experta y, si es apropiado, recomienda alguna de las mascotas reales de la lista.
- Sé breve, amigable y utiliza emojis con moderación.

MENSAJE DEL USUARIO:
"${userMessage}"

DATOS REALES DEL SISTEMA (OBTENIDOS DE SUPABASE):
${JSON.stringify(supabaseData, null, 2)}`

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  { role: 'user', parts: [{ text: draftPrompt }] }
                ],
                generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
              })
            }
          )

          if (geminiRes.ok) {
            const data = await geminiRes.json()
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              responseText = text.trim()
            }
          }
        } catch (err) {
          console.error('Error al redactar respuesta con Gemini:', err)
        }
      }

      // Fallback local si Gemini no está configurado o falla
      if (!responseText) {
        if (action === 'contar_mascotas') {
          const count = supabaseData?.count ?? 0
          responseText = `Actualmente tenemos ${count} mascotas disponibles para adopción.`
        }
        else if (action === 'listar_mascotas') {
          if (!supabaseData?.length) {
            responseText = 'No hay mascotas disponibles para adopción en este momento.'
          } else {
            const list = supabaseData.map((p: any) => `• ${p.name} (${p.species}${p.breed ? ` - ${p.breed}` : ''})`).join('\n')
            responseText = `🐾 Aquí tienes las mascotas disponibles en nuestro catálogo:\n${list}`
          }
        }
        else if (action === 'listar_razas') {
          const breeds = Array.from(new Set(supabaseData?.map((p: any) => p.breed).filter(Boolean)))
          if (!breeds.length) {
            responseText = 'No tenemos razas específicas registradas en este momento.'
          } else {
            responseText = `🐕 Las razas disponibles en este momento son:\n${breeds.map(b => `• ${b}`).join('\n')}`
          }
        }
        else if (action === 'filtrar_perros') {
          if (!supabaseData?.length) {
            responseText = 'No hay perros disponibles para adopción en este momento.'
          } else {
            const list = supabaseData.map((p: any) => `• ${p.name}${p.breed ? ` (${p.breed})` : ''}`).join('\n')
            responseText = `🐕 Aquí tienes los perros disponibles para adopción:\n${list}`
          }
        }
        else if (action === 'filtrar_gatos') {
          if (!supabaseData?.length) {
            responseText = 'No hay gatos disponibles para adopción en este momento.'
          } else {
            const list = supabaseData.map((p: any) => `• ${p.name}${p.breed ? ` (${p.breed})` : ''}`).join('\n')
            responseText = `🐈 Aquí tienes los gatos disponibles para adopción:\n${list}`
          }
        }
        else if (action === 'buscar_mascota_especifica') {
          if (!supabaseData?.length) {
            responseText = `No encontré ninguna mascota disponible que coincida con tu búsqueda.`
          } else {
            const list = supabaseData.map((p: any) => `• ${p.name} (${p.species}${p.breed ? ` - ${p.breed}` : ''}) — ${p.description || 'Sin descripción'}`).join('\n')
            responseText = `🔍 Encontré estas mascotas disponibles para ti:\n${list}`
          }
        }
        else if (action === 'crear_solicitud_adopcion') {
          const petName = nameParam || 'la mascota'
          responseText = `✍️ ¡Qué alegría que quieras adoptar a ${petName}! Para iniciar tu solicitud, ve a la sección **Mascotas** en tu Dashboard, busca a ${petName} y haz clic en el botón **Adoptar**.`
        }
        else if (action === 'ver_solicitudes') {
          if (!supabaseData?.length) {
            responseText = '📋 No tienes solicitudes de adopción registradas aún.'
          } else {
            const list = supabaseData.map((r: any) => `• ${r.pets?.name ?? 'Mascota'} — **${r.status}**`).join('\n')
            responseText = `📋 Tus solicitudes de adopción más recientes:\n${list}`
          }
        }
        else if (action === 'ver_solicitudes_pendientes') {
          if (!supabaseData?.length) {
            responseText = '⏳ No tienes ninguna solicitud de adopción pendiente en este momento.'
          } else {
            const list = supabaseData.map((r: any) => `• ${r.pets?.name ?? 'Mascota'} — **Pendiente**`).join('\n')
            responseText = `⏳ Tienes las siguientes solicitudes de adopción pendientes:\n${list}`
          }
        }
        else if (action === 'ver_favoritos') {
          if (!supabaseData?.length) {
            responseText = '❤️ No tienes mascotas guardadas en tus favoritos todavía.'
          } else {
            const list = supabaseData.map((f: any) => `• ${f.pets?.name ?? 'Mascota'} (${f.pets?.species ?? 'especie'})`).join('\n')
            responseText = `❤️ Tus mascotas favoritas guardadas:\n${list}`
          }
        }
        else if (action === 'ver_notificaciones') {
          if (!supabaseData?.length) {
            responseText = '🔔 No tienes notificaciones pendientes de leer.'
          } else {
            const list = supabaseData.map((n: any) => `• **${n.title}**: ${n.content}`).join('\n')
            responseText = `🔔 Aquí tienes tus notificaciones pendientes:\n${list}`
          }
        }
        else {
          responseText = '¡Hola! 🐾 Soy tu asesor inteligente de PetAdopt. Te recomiendo alimentar bien a tu mascota, vacunarla a tiempo y darle mucho amor. ¿Te gustaría saber cuántas mascotas tenemos disponibles o ver el catálogo?'
        }
      }

      console.log('respuesta final:', responseText)

      return NextResponse.json({
        fulfillmentResponse: {
          messages: [
            {
              text: {
                text: [responseText]
              }
            }
          ]
        }
      })
    }

    // ── CONSULTAS DE MASCOTAS ──────────────────────────────────────

    // Tag: "contar_mascotas" — ¿Cuántas mascotas disponibles reales hay?
    if (tag === 'contar_mascotas') {
      console.log('3. Tabla consultada: pets')
      console.log('4. Filtro usado: status = disponible')

      const { data: petsData, count, error } = await supabase
        .from('pets')
        .select('*', { count: 'exact' })
        .eq('status', 'disponible')

      console.log('5. Datos devueltos por Supabase:', JSON.stringify(petsData, null, 2))
      console.log('6. Count final:', count)
      
      if (error) {
        console.error('7. Error de Supabase:', error)
      } else {
        console.log('7. Error de Supabase: ninguno')
      }

      return NextResponse.json({
        fulfillmentResponse: {
          messages: [
            {
              text: {
                text: [
                  `Actualmente tenemos ${count ?? 0} mascotas disponibles para adopción.`
                ]
              }
            }
          ]
        }
      })
    }
    // Tag: "pets-available" — ¿Cuántas mascotas disponibles hay? ¿Cuántos perros disponibles?
    else if (tag === 'pets-available' || matchText(text, ['disponible', 'cuantos', 'cuántos', 'hay'])) {
      const { data: pets, count } = await supabase
        .from('pets')
        .select('name, species, breed', { count: 'exact' })
        .eq('status', 'disponible')
        .limit(5)

      if (!pets?.length) {
        responseText = 'En este momento no hay mascotas disponibles para adopción.'
      } else {
        const species = text.toLowerCase()
        const filteredBySpecies = filterBySpecies(pets, species)
        const list = filteredBySpecies.length > 0 ? filteredBySpecies : pets

        const listStr = list
          .map((p) => `• ${p.name} (${p.species}${p.breed ? ` - ${p.breed}` : ''})`)
          .join('\n')

        const total = filteredBySpecies.length > 0 ? filteredBySpecies.length : (count ?? pets.length)
        const speciesLabel = getSpeciesFromText(species)

        responseText = speciesLabel
          ? `Hay ${total} ${speciesLabel}(s) disponibles para adopción:\n${listStr}`
          : `Hay ${count} mascotas disponibles para adopción. Aquí las primeras:\n${listStr}`
      }
    }

    // Tag: "pets-total" — ¿Cuántas mascotas hay en total?
    else if (tag === 'pets-total' || matchText(text, ['total', 'registradas', 'sistema'])) {
      const { count: disponible } = await supabase.from('pets').select('*', { count: 'exact', head: true }).eq('status', 'disponible')
      const { count: proceso } = await supabase.from('pets').select('*', { count: 'exact', head: true }).eq('status', 'en_proceso')
      const { count: adoptado } = await supabase.from('pets').select('*', { count: 'exact', head: true }).eq('status', 'adoptado')
      const total = (disponible ?? 0) + (proceso ?? 0) + (adoptado ?? 0)

      responseText = `📊 Resumen de mascotas en el sistema:\n• Total: ${total}\n• Disponibles: ${disponible ?? 0}\n• En proceso de adopción: ${proceso ?? 0}\n• Ya adoptadas: ${adoptado ?? 0}`
    }

    // Tag: "pets-adopted" — ¿Cuántas mascotas han sido adoptadas?
    else if (tag === 'pets-adopted' || matchText(text, ['adoptad'])) {
      const { count } = await supabase.from('pets').select('*', { count: 'exact', head: true }).eq('status', 'adoptado')
      responseText = `🎉 Un total de ${count ?? 0} mascotas han sido adoptadas exitosamente a través del sistema.`
    }

    // Tag: "pets-list" — Lista de mascotas disponibles con nombre
    else if (tag === 'pets-list' || matchText(text, ['lista', 'cuales', 'cuáles', 'ver'])) {
      const speciesFilter = getSpeciesFromText(text.toLowerCase())
      let query = supabase.from('pets').select('name, species, breed, age').eq('status', 'disponible')

      if (speciesFilter) {
        query = query.eq('species', speciesFilter)
      }

      const { data: pets } = await query.limit(6)

      if (!pets?.length) {
        responseText = speciesFilter
          ? `No hay ${speciesFilter}s disponibles en este momento.`
          : 'No hay mascotas disponibles en este momento.'
      } else {
        const list = pets.map(p =>
          `• ${p.name} — ${p.species}${p.breed ? ` (${p.breed})` : ''}${p.age ? `, ${p.age} año(s)` : ''}`
        ).join('\n')
        responseText = `🐾 Mascotas disponibles${speciesFilter ? ` (${speciesFilter}s)` : ''}:\n${list}`
      }
    }

    // Tag: "requests-count" — ¿Cuántas solicitudes hay pendientes?
    else if (tag === 'requests-count' || matchText(text, ['solicitud', 'pendiente', 'pedido'])) {
      const { count: pendiente } = await supabase.from('adoption_requests').select('*', { count: 'exact', head: true }).eq('status', 'pendiente')
      const { count: aprobada } = await supabase.from('adoption_requests').select('*', { count: 'exact', head: true }).eq('status', 'aprobada')
      const { count: rechazada } = await supabase.from('adoption_requests').select('*', { count: 'exact', head: true }).eq('status', 'rechazada')

      responseText = `📋 Estado de solicitudes de adopción:\n• Pendientes de revisión: ${pendiente ?? 0}\n• Aprobadas: ${aprobada ?? 0}\n• Rechazadas: ${rechazada ?? 0}`
    }

    // Respuesta por defecto si no se reconoce la consulta
    else {
      responseText = 'Puedo ayudarte con información del sistema. Prueba preguntando:\n• ¿Cuántos perros disponibles hay?\n• ¿Cuántas mascotas hay en total?\n• ¿Cuántas adopciones se han completado?\n• Lista de mascotas disponibles'
    }

    // Formato de respuesta que Dialogflow CX espera
    return NextResponse.json({
      fulfillmentResponse: {
        messages: [
          {
            text: {
              text: [responseText]
            }
          }
        ]
      }
    })
  } catch (error) {
    console.error('Error en webhook de Dialogflow:', error)
    return NextResponse.json({
      fulfillmentResponse: {
        messages: [{ text: { text: ['Ocurrió un error al consultar los datos. Por favor intenta de nuevo.'] } }]
      }
    })
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function matchText(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return keywords.some(k => normalized.includes(k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
}

function getSpeciesFromText(text: string): string | null {
  if (text.includes('perro') || text.includes('dog') || text.includes('canino')) return 'perro'
  if (text.includes('gato') || text.includes('cat') || text.includes('felino')) return 'gato'
  if (text.includes('conejo') || text.includes('rabbit')) return 'conejo'
  if (text.includes('ave') || text.includes('pajaro') || text.includes('pájaro') || text.includes('bird')) return 'ave'
  return null
}

function filterBySpecies(pets: { name: string; species: string; breed: string }[], text: string) {
  const species = getSpeciesFromText(text)
  if (!species) return []
  return pets.filter(p => p.species === species)
}
