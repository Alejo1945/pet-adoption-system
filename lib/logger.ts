import { createClient } from '@/lib/supabase/server'

interface LogOperationParams {
  operation_type: string
  user_id: string | null
  success: boolean
  error_message?: string
  latency_ms?: number
  metadata?: Record<string, unknown>
}

/**
 * Registra una operación en la tabla operation_logs
 */
export async function logOperation(params: LogOperationParams) {
  try {
    const supabase = await createClient()
    await supabase.from('operation_logs').insert({
      operation_type: params.operation_type,
      user_id: params.user_id,
      success: params.success,
      error_message: params.error_message ?? '',
      latency_ms: params.latency_ms ?? 0,
      metadata: params.metadata ?? {},
    })
  } catch {
    // No interrumpir el flujo principal si el log falla
    console.error('Failed to log operation')
  }
}

interface LogVectorParams {
  operation_type: 'insert' | 'search'
  user_id: string | null
  query_text?: string
  latency_ms?: number
  similarity_score?: number
  results_count?: number
  embedding_time_ms?: number
}

/**
 * Registra una operación vectorial en vector_logs
 */
export async function logVectorOperation(params: LogVectorParams) {
  try {
    const supabase = await createClient()
    await supabase.from('vector_logs').insert({
      operation_type: params.operation_type,
      user_id: params.user_id,
      query_text: params.query_text ?? '',
      latency_ms: params.latency_ms ?? 0,
      similarity_score: params.similarity_score ?? 0,
      results_count: params.results_count ?? 0,
      embedding_time_ms: params.embedding_time_ms ?? 0,
    })
  } catch {
    console.error('Failed to log vector operation')
  }
}
