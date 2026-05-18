/**
 * Generación de embeddings simulados (50 dimensiones)
 * Usa hashing de caracteres para convertir texto en vector numérico.
 * Compatible con pgvector de Supabase.
 */

const VECTOR_DIMS = 50

/**
 * Convierte texto en un vector de 50 dimensiones (embedding simulado)
 */
export function generateEmbedding(text: string): number[] {
  const startTime = performance.now()
  const vector = new Array(VECTOR_DIMS).fill(0)

  // Normalizar el texto
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()

  const words = normalized.split(/\s+/).filter(Boolean)

  // Generar vector por hashing de palabras
  for (const word of words) {
    // Hash primario (posición en el vector)
    let hash1 = 0
    for (let i = 0; i < word.length; i++) {
      hash1 = (hash1 * 31 + word.charCodeAt(i)) >>> 0
    }
    const idx1 = hash1 % VECTOR_DIMS
    vector[idx1] += 1

    // Hash secundario para n-gramas de 2 caracteres
    for (let i = 0; i < word.length - 1; i++) {
      const bigram = word[i] + word[i + 1]
      let hash2 = 0
      for (let j = 0; j < bigram.length; j++) {
        hash2 = (hash2 * 37 + bigram.charCodeAt(j)) >>> 0
      }
      const idx2 = hash2 % VECTOR_DIMS
      vector[idx2] += 0.5
    }
  }

  // Normalizar el vector (longitud unitaria)
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  const normalized_vector = magnitude > 0
    ? vector.map(v => parseFloat((v / magnitude).toFixed(6)))
    : vector

  const endTime = performance.now()
  const embeddingTime = endTime - startTime

  return normalized_vector
}

/**
 * Calcula la similitud coseno entre dos vectores
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB)
  return magnitude > 0 ? dot / magnitude : 0
}

/**
 * Convierte un vector a formato string para pgvector
 * Ejemplo: [0.1, 0.2, ...] -> '[0.1,0.2,...]'
 */
export function vectorToString(vector: number[]): string {
  return `[${vector.join(',')}]`
}

/**
 * Genera el texto completo para embedding de una mascota
 */
export function getPetEmbeddingText(pet: {
  name: string
  species: string
  breed?: string
  description: string
}): string {
  return `${pet.name} ${pet.species} ${pet.breed ?? ''} ${pet.description}`
    .trim()
    .replace(/\s+/g, ' ')
}

export const EMBEDDING_DIMS = VECTOR_DIMS
