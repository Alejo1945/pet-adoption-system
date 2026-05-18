import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding, vectorToString } from '@/lib/embeddings'

// POST /api/chat — Supabase para datos del sistema + Gemini para IA conversacional
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { message } = await request.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })

  const role = user.user_metadata?.role ?? 'cliente'
  const userName = user.user_metadata?.full_name ?? ''
  const isAdmin = role === 'admin'

  await supabase.from('chat_messages').insert({ user_id: user.id, role: 'user', content: message })

  const response = await generateResponse(message, user.id, isAdmin, supabase, userName)

  await supabase.from('chat_messages').insert({ user_id: user.id, role: 'assistant', content: response })

  return NextResponse.json({ response, role: 'assistant' })
}

async function generateResponse(
  message: string,
  userId: string,
  isAdmin: boolean,
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userName: string
): Promise<string> {
  const msg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // ─── Cantidad de mascotas ───
  if (msg.match(/cuant[ao]s?\s+(registro|mascota|pet)/)) {
    if (isAdmin) {
      const { count } = await supabase.from('pets').select('*', { count: 'exact', head: true })
      const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'cliente')
      return `📊 En total hay **${count ?? 0} mascotas** registradas en el sistema por **${userCount ?? 0} clientes**.`
    } else {
      const { count } = await supabase.from('pets').select('*', { count: 'exact', head: true }).eq('user_id', userId)
      return `🐾 Hay **${count ?? 0} mascotas** registradas en el sistema.`
    }
  }

  // ─── Últimos registros ───
  if (msg.match(/(ultimo|reciente|nuevo)[s]?\s+(registro|mascota)/)) {
    const query = isAdmin
      ? supabase.from('pets').select('name, species, breed, status, created_at').order('created_at', { ascending: false }).limit(5)
      : supabase.from('pets').select('name, species, breed, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
    const { data: pets } = await query
    if (!pets?.length) return '📭 No hay mascotas registradas aún.'
    const list = pets.map((p, i) =>
      `${i + 1}. **${p.name}** (${p.species}${p.breed ? ` - ${p.breed}` : ''}) — *${p.status}* — ${new Date(p.created_at).toLocaleDateString('es-MX')}`
    ).join('\n')
    return `🐾 **Últimas mascotas registradas:**\n\n${list}`
  }

  // ─── Búsqueda semántica ───
  if (msg.match(/(similar|parecid|busca|encuentr)/)) {
    const embeddingVec = generateEmbedding(message)
    const { data: results } = await supabase.rpc('search_similar_pets', {
      query_embedding: vectorToString(embeddingVec),
      match_threshold: 0.2,
      match_count: 3,
    })
    if (!results?.length) return '🔍 No encontré mascotas similares. Intenta con otras palabras.'
    const list = results.map((r: Record<string, unknown>, i: number) =>
      `${i + 1}. **${r.name}** (${r.species}) — ${((r.similarity as number) * 100).toFixed(0)}% de similitud\n   _${r.description}_`
    ).join('\n\n')
    return `🔍 **Mascotas similares a tu búsqueda:**\n\n${list}`
  }

  // ─── Errores del sistema (solo admin) ───
  if (msg.match(/(error|fallo|problem)/)) {
    if (!isAdmin) return '⚠️ Solo los administradores pueden ver los errores del sistema.'
    const { data: errors } = await supabase.from('operation_logs').select('operation_type, error_message, created_at').eq('success', false).order('created_at', { ascending: false }).limit(5)
    if (!errors?.length) return '✅ No se han registrado errores en el sistema.'
    const list = errors.map((e, i) => `${i + 1}. **${e.operation_type}** — ${e.error_message}`).join('\n')
    return `❌ **Últimos errores:**\n\n${list}`
  }

  // ─── Latencia ───
  if (msg.match(/(latencia|tiempo|velocidad|demor)/)) {
    const { data: logs } = await supabase.from('operation_logs').select('latency_ms').eq('success', true)
    const avg = logs?.length ? logs.reduce((s, l) => s + l.latency_ms, 0) / logs.length : 0
    return `⚡ **Tiempo promedio de inserción:** ${avg.toFixed(2)} ms`
  }

  // ─── Usuario con más registros (solo admin) ───
  if (msg.match(/(quien|usuario|mas registro|top)/)) {
    if (!isAdmin) return '🔒 Solo los administradores pueden ver esta información.'
    const { data: pets } = await supabase.from('pets').select('user_id, profiles(full_name)')
    const counts: Record<string, { name: string; count: number }> = {}
    for (const p of pets ?? []) {
      const uid = p.user_id ?? 'unknown'
      const name = (p.profiles as any)?.full_name ?? 'Desconocido'
      counts[uid] = { name, count: (counts[uid]?.count ?? 0) + 1 }
    }
    const top = Object.values(counts).sort((a, b) => b.count - a.count)[0]
    if (!top) return '📭 No hay registros aún.'
    return `🏆 El usuario con más registros es **${top.name}** con **${top.count} mascotas**.`
  }

  // ─── Mascotas disponibles / listado ───
  if (msg.match(/(disponible|cuantos|cuántos|cuales|cuáles|lista|hay|ver mascota)/)) {
    const { data: pets, count } = await supabase.from('pets').select('name, species, breed', { count: 'exact' }).eq('status', 'disponible').limit(6)
    if (!pets?.length) return '📭 No hay mascotas disponibles en este momento.'
    const list = pets.map((p, i) => `${i + 1}. **${p.name}** — ${p.species}${p.breed ? ` (${p.breed})` : ''}`).join('\n')
    return `🐾 **Mascotas disponibles (${count} en total):**\n\n${list}\n\nPuedes verlas todas en la sección de **Mascotas**.`
  }

  // ─── Solicitudes ───
  if (msg.match(/(solicitud|pedido|adopt)/)) {
    const query = isAdmin
      ? supabase.from('adoption_requests').select('status, pets(name), profiles(full_name)').order('created_at', { ascending: false }).limit(5)
      : supabase.from('adoption_requests').select('status, pets(name)').eq('user_id', userId).order('created_at', { ascending: false })
    const { data: reqs } = await query
    if (!reqs?.length) return '📭 No hay solicitudes de adopción registradas.'
    const list = reqs.map((r, i) => {
      const petName = (r.pets as any)?.name ?? 'desconocida'
      return `${i + 1}. ${petName} — **${r.status}**`
    }).join('\n')
    return `📋 **Solicitudes de adopción:**\n\n${list}`
  }

  // ─── Métricas generales ───
  if (msg.match(/(metrica|estadistica|resumen|dashboard)/)) {
    if (!isAdmin) return '🔒 Las métricas solo están disponibles para administradores.'
    const { count: total } = await supabase.from('pets').select('*', { count: 'exact', head: true })
    const { count: users } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
    const { count: chats } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('role', 'user')
    return `📊 **Resumen del sistema:**\n- 🐾 Total mascotas: **${total ?? 0}**\n- 👥 Total usuarios: **${users ?? 0}**\n- 💬 Consultas al agente: **${chats ?? 0}**`
  }

  // ─── Saludo / Ayuda ───
  if (msg.match(/(ayuda|help|que puedes|como funciona|hola|buenos)/)) {
    const greeting = userName ? `¡Hola, **${userName}**! ` : '¡Hola! '
    return `${greeting}Soy el **Agente IA** de PetAdopt 🐾\n\nPuedo ayudarte con:\n- 📊 Datos del sistema (mascotas, solicitudes, métricas)\n- 🐕 Recomendaciones de razas según tu estilo de vida\n- 💡 Consejos de adopción y cuidado\n- 🔍 Buscar mascotas disponibles\n\n¡Pregúntame lo que necesites!`
  }

  // ─── CONOCIMIENTO DE RAZAS Y MASCOTAS (sin API externa) ───

  // Razas para departamento/apartamento
  if (msg.match(/(departamento|apartamento|piso|pequen|chico|pequeño)/)) {
    return `🏠 **Razas ideales para departamento:**\n\n🐕 **Perros:**\n- **Bichón Maltés** — tranquilo, poco pelo, muy cariñoso\n- **Shih Tzu** — adaptable, juguetón y no ladra mucho\n- **Chihuahua** — pequeño, fácil de manejar\n- **Poodle Toy** — inteligente, hipoalergénico\n- **Yorkshire Terrier** — activo pero se adapta bien\n\n🐈 **Gatos (aún mejores para departamento):**\n- **Ragdoll** — tranquilo y apegado al dueño\n- **Persa** — sedentario y muy relajado\n- **British Shorthair** — independiente y adaptable\n\n💡 Recuerda que todos necesitan ejercicio diario y enriquecimiento mental, sin importar el tamaño. ¿Quieres ver cuáles están disponibles ahora?`
  }

  // Razas para familias con niños
  if (msg.match(/(nino|niño|familia|hijo|infantil|bebe|bebé)/)) {
    return `👨‍👩‍👧 **Mejores razas para familias con niños:**\n\n🐕 **Perros:**\n- **Golden Retriever** — paciente, gentil y muy juguetón\n- **Labrador** — energético, leal y tolerante\n- **Beagle** — amigable, curioso y de tamaño mediano\n- **Boxer** — protector, juguetón y muy apegado a los niños\n- **Poodle** — inteligente, hipoalergénico y muy sociable\n\n🐈 **Gatos:**\n- **Maine Coon** — grande, gentil y muy paciente\n- **Abisinio** — activo y le encanta jugar\n\n💡 La socialización temprana es clave. ¿Te gustaría ver las mascotas disponibles ahora mismo?`
  }

  // Recomendación de raza general
  if (msg.match(/(recomienda|sugiere|cual.*raza|que raza|mejor raza|que mascota)/)) {
    return `🐾 **Para recomendarte la raza perfecta, dime:**\n\n1. ¿Vives en casa o departamento?\n2. ¿Tienes niños o adultos mayores en casa?\n3. ¿Cuánto tiempo tienes para ejercitarla al día?\n4. ¿Prefieres perro, gato u otra mascota?\n\nMientras tanto, aquí algunas opciones populares:\n\n🐕 **Para activos:** Border Collie, Husky, Labrador\n🐕 **Para tranquilos:** Bulldog, Basset Hound, Shih Tzu\n🐈 **Para independientes:** Gato Común Europeo, British Shorthair\n🐈 **Para cariñosos:** Ragdoll, Siamés, Maine Coon\n\n¿Cuéntame más sobre tu situación!`
  }

  // Primeros pasos / adopción
  if (msg.match(/(primer[ao]|antes de adopt|preparar|llegue|llega|nuevo en casa)/)) {
    return `🏡 **Antes de adoptar, prepara tu hogar:**\n\n✅ **Lista de preparación:**\n- Cama o espacio exclusivo para la mascota\n- Comedero y bebedero de calidad\n- Juguetes para estimulación mental\n- Collar con identificación\n- Visita al veterinario programada (vacunas y desparasitación)\n\n📅 **Primera semana:**\n- Dale tiempo para adaptarse, no lo abrumes\n- Establece rutinas desde el primer día\n- Sé paciente: puede estar estresado los primeros días\n\n💡 ¿Quieres solicitar la adopción de alguna mascota que viste en el catálogo?`
  }

  // Cuidados generales
  if (msg.match(/(cuidado|alimenta|vacuna|veterinario|salud|baño|higiene)/)) {
    return `🩺 **Cuidados básicos de tu mascota:**\n\n🍖 **Alimentación:**\n- Alimento de calidad según edad y tamaño\n- Agua fresca siempre disponible\n- Evita chocolate, uvas, cebolla y aguacate (tóxicos)\n\n💉 **Salud:**\n- Vacunas al día (rabia, moquillo, parvovirus)\n- Desparasitación cada 3-6 meses\n- Revisión veterinaria anual mínima\n\n🛁 **Higiene:**\n- Perros: baño cada 2-4 semanas según raza\n- Gatos: se limpian solos, cepillar el pelo regularmente\n- Limpieza de oídos y dientes periódicamente\n\n¿Tienes alguna pregunta específica sobre el cuidado?`
  }

  // ─── GEMINI: para todo lo demás (conversación natural, preguntas abiertas) ───
  return await askGemini(message, isAdmin, supabase, userName)
}

async function askGemini(
  message: string,
  isAdmin: boolean,
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userName: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    // Sin API key: respuesta amigable para conversación general
    return `¡Hola! 🐾 Soy el asistente de PetAdopt. Puedo ayudarte con:\n\n- 🐕 *"¿Cuántos perros disponibles hay?"*\n- 🐈 *"¿Hay gatos disponibles?"*\n- 📋 *"¿Cuáles son mis solicitudes?"*\n- 💡 *"¿Me recomiendas una raza para departamento?"*\n- 🏡 *"¿Qué necesito antes de adoptar?"*\n\n¿En qué te puedo ayudar?`
  }

  // Obtener mascotas disponibles para dar respuestas personalizadas
  const { data: availablePets } = await supabase
    .from('pets')
    .select('name, species, breed, age, description, status')
    .eq('status', 'disponible')
    .limit(10)

  const petsContext = availablePets?.length
    ? availablePets.map(p =>
        `- ${p.name} (${p.species}${p.breed ? `, ${p.breed}` : ''}${p.age ? `, ${p.age} año(s)` : ''}): ${p.description}`
      ).join('\n')
    : 'No hay mascotas disponibles actualmente en el sistema.'

  const systemPrompt = `Eres el asistente virtual de PetAdopt, un sistema de adopción de mascotas.
Eres cálido, empático y experto en mascotas, razas, cuidados y adopciones responsables.
${userName ? `El usuario se llama ${userName}.` : ''}
${isAdmin ? 'El usuario es administrador del sistema.' : 'El usuario busca adoptar una mascota.'}

MASCOTAS DISPONIBLES AHORA EN EL SISTEMA:
${petsContext}

INSTRUCCIONES:
- Responde siempre en español de forma natural y conversacional
- Si preguntan si hay mascotas disponibles, menciona las que están en la lista de arriba por nombre
- Si preguntan por una especie específica (perros, gatos), filtra la lista y muéstralas
- Si preguntan por razas, da recomendaciones personalizadas y menciona si hay alguna en el sistema
- Sé conciso pero cálido — máximo 3 párrafos
- Usa emojis con moderación
- Si el usuario quiere adoptar, anímalos a ir a la sección "Mascotas" del sistema`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: '¡Entendido! Estoy listo para ayudarte con la adopción de mascotas.' }] },
            { role: 'user', parts: [{ text: message }] }
          ],
          generationConfig: { temperature: 0.75, maxOutputTokens: 500 }
        })
      }
    )

    if (!res.ok) throw new Error(`Gemini error: ${res.status}`)
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    return text ?? '🤔 No pude generar una respuesta. Intenta de nuevo.'
  } catch (err) {
    console.error('Error Gemini:', err)
    return '🤔 No pude conectarme al servicio de IA ahora mismo. Pregúntame sobre mascotas disponibles, solicitudes o consejos de cuidado.'
  }
}
