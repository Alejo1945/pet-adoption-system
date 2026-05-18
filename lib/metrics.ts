import { createClient } from '@/lib/supabase/server'
import { EMBEDDING_DIMS } from '@/lib/embeddings'

export interface SystemMetrics {
  // Métricas obligatorias (1-10)
  totalRecords: number
  recordsByUser: { user_id: string; full_name: string; count: number }[]
  avgInsertLatency: number
  insertErrors: number
  insertSuccessRate: number
  avgQueryLatency: number
  totalChatQueries: number
  avgSimilarityScore: number
  duplicatesDetected: number
  vectorStorageInfo: { count: number; dimensions: number }

  // Métricas adicionales
  avgEmbeddingTime: number
  queriesByRole: { admin: number; cliente: number }
  failedAttemptsByUser: { user_id: string; full_name: string; count: number }[]
  topQueriedTerms: { term: string; count: number }[]
  recordsByDate: { date: string; count: number }[]
  successfulChats: number
  emptyResults: number
  totalUsers: number
  availablePets: number
  adoptedPets: number
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const supabase = await createClient()

  // 1. Total de registros
  const { count: totalRecords } = await supabase
    .from('pets')
    .select('*', { count: 'exact', head: true })

  // 2. Registros por usuario
  const { data: petsByUser } = await supabase
    .from('pets')
    .select('user_id, profiles(full_name)')

  const userCounts: Record<string, { name: string; count: number }> = {}
  for (const pet of petsByUser ?? []) {
    const uid = pet.user_id ?? 'unknown'
    const name = (pet.profiles as any)?.full_name ?? 'Desconocido'
    if (!userCounts[uid]) userCounts[uid] = { name, count: 0 }
    userCounts[uid].count++
  }
  const recordsByUser = Object.entries(userCounts).map(([user_id, { name, count }]) => ({
    user_id,
    full_name: name,
    count,
  }))

  // 3. Latencia promedio de inserción
  const { data: insertLogs } = await supabase
    .from('operation_logs')
    .select('latency_ms')
    .eq('operation_type', 'insert_pet')
    .eq('success', true)

  const avgInsertLatency = insertLogs?.length
    ? insertLogs.reduce((s, l) => s + (l.latency_ms ?? 0), 0) / insertLogs.length
    : 0

  // 4. Errores de ingreso
  const { count: insertErrors } = await supabase
    .from('operation_logs')
    .select('*', { count: 'exact', head: true })
    .eq('success', false)

  // 5. Tasa de éxito
  const { count: totalAttempts } = await supabase
    .from('operation_logs')
    .select('*', { count: 'exact', head: true })

  const insertSuccessRate =
    (totalAttempts ?? 0) > 0
      ? (((totalAttempts ?? 0) - (insertErrors ?? 0)) / (totalAttempts ?? 1)) * 100
      : 100

  // 6. Tiempo promedio de consulta semántica
  const { data: queryLogs } = await supabase
    .from('vector_logs')
    .select('latency_ms')
    .eq('operation_type', 'search')

  const avgQueryLatency = queryLogs?.length
    ? queryLogs.reduce((s, l) => s + (l.latency_ms ?? 0), 0) / queryLogs.length
    : 0

  // 7. Total de consultas al agente
  const { count: totalChatQueries } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'user')

  // 8. Precisión/relevancia promedio
  const { data: searchLogs } = await supabase
    .from('vector_logs')
    .select('similarity_score')
    .gt('similarity_score', 0)

  const avgSimilarityScore = searchLogs?.length
    ? searchLogs.reduce((s, l) => s + (l.similarity_score ?? 0), 0) / searchLogs.length
    : 0

  // 9. Registros duplicados (similitud > 0.92)
  const { count: duplicatesDetected } = await supabase
    .from('vector_logs')
    .select('*', { count: 'exact', head: true })
    .gte('similarity_score', 0.92)

  // 10. Uso de almacenamiento vectorial
  const { count: vectorCount } = await supabase
    .from('pets')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null)

  // Métricas adicionales
  const { data: embeddingLogs } = await supabase
    .from('vector_logs')
    .select('embedding_time_ms')
    .gt('embedding_time_ms', 0)

  const avgEmbeddingTime = embeddingLogs?.length
    ? embeddingLogs.reduce((s, l) => s + (l.embedding_time_ms ?? 0), 0) / embeddingLogs.length
    : 0

  // Total de usuarios
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  // Mascotas disponibles / adoptadas
  const { count: availablePets } = await supabase
    .from('pets')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'disponible')

  const { count: adoptedPets } = await supabase
    .from('pets')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'adoptado')

  // Registros por fecha (últimos 7 días)
  const { data: recentPets } = await supabase
    .from('pets')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const dateMap: Record<string, number> = {}
  for (const pet of recentPets ?? []) {
    const date = new Date(pet.created_at).toLocaleDateString('es-MX', {
      month: 'short', day: 'numeric'
    })
    dateMap[date] = (dateMap[date] ?? 0) + 1
  }
  const recordsByDate = Object.entries(dateMap)
    .map(([date, count]) => ({ date, count }))
    .slice(0, 7)
    .reverse()

  // Consultas exitosas del chat (con resultados)
  const { count: successfulChats } = await supabase
    .from('vector_logs')
    .select('*', { count: 'exact', head: true })
    .gt('results_count', 0)

  const { count: emptyResults } = await supabase
    .from('vector_logs')
    .select('*', { count: 'exact', head: true })
    .eq('results_count', 0)

  return {
    totalRecords: totalRecords ?? 0,
    recordsByUser,
    avgInsertLatency: parseFloat(avgInsertLatency.toFixed(2)),
    insertErrors: insertErrors ?? 0,
    insertSuccessRate: parseFloat(insertSuccessRate.toFixed(1)),
    avgQueryLatency: parseFloat(avgQueryLatency.toFixed(2)),
    totalChatQueries: totalChatQueries ?? 0,
    avgSimilarityScore: parseFloat((avgSimilarityScore * 100).toFixed(1)),
    duplicatesDetected: duplicatesDetected ?? 0,
    vectorStorageInfo: { count: vectorCount ?? 0, dimensions: EMBEDDING_DIMS },
    avgEmbeddingTime: parseFloat(avgEmbeddingTime.toFixed(2)),
    queriesByRole: { admin: 0, cliente: 0 },
    failedAttemptsByUser: [],
    topQueriedTerms: [],
    recordsByDate,
    successfulChats: successfulChats ?? 0,
    emptyResults: emptyResults ?? 0,
    totalUsers: totalUsers ?? 0,
    availablePets: availablePets ?? 0,
    adoptedPets: adoptedPets ?? 0,
  }
}
