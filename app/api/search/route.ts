import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding, vectorToString } from '@/lib/embeddings'
import { logVectorOperation } from '@/lib/logger'

// POST /api/search — búsqueda semántica
export async function POST(request: NextRequest) {
  const startTime = performance.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { query, threshold = 0.3, limit = 5 } = await request.json()

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Query requerida' }, { status: 400 })
  }

  // Generar embedding para la consulta
  const embeddingStart = performance.now()
  const queryEmbedding = generateEmbedding(query)
  const embeddingTime = performance.now() - embeddingStart
  const embeddingStr = vectorToString(queryEmbedding)

  // Búsqueda semántica usando pgvector
  const { data: results, error } = await supabase.rpc('search_similar_pets', {
    query_embedding: embeddingStr,
    match_threshold: threshold,
    match_count: limit,
  })

  const totalLatency = performance.now() - startTime
  const topSimilarity = results?.[0]?.similarity ?? 0

  await logVectorOperation({
    operation_type: 'search',
    user_id: user.id,
    query_text: query,
    latency_ms: totalLatency,
    similarity_score: topSimilarity,
    results_count: results?.length ?? 0,
    embedding_time_ms: embeddingTime,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    results: results ?? [],
    meta: {
      query,
      latency_ms: parseFloat(totalLatency.toFixed(2)),
      embedding_time_ms: parseFloat(embeddingTime.toFixed(2)),
      results_count: results?.length ?? 0,
      top_similarity: parseFloat((topSimilarity * 100).toFixed(1)),
    }
  })
}
