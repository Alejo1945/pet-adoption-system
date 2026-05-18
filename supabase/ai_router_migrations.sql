-- =========================================================================
-- MIGRACIÓN DE ESQUEMAS PARA AI ROUTER (PetAdopt)
-- Ejecutar en Supabase Dashboard > SQL Editor > New Query
-- =========================================================================

-- 1. Ampliación de la tabla `chat_messages` para aislamiento de historial y metadata multi-turno
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS conversation_id TEXT,
ADD COLUMN IF NOT EXISTS sender TEXT,
ADD COLUMN IF NOT EXISTS message TEXT,
ADD COLUMN IF NOT EXISTS response TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. Habilitar pgvector si no existe
CREATE EXTENSION IF NOT EXISTS vector;

-- 3. Ampliación de la tabla `vector_logs` para almacenar los embeddings reales
ALTER TABLE public.vector_logs 
ADD COLUMN IF NOT EXISTS table_name TEXT,
ADD COLUMN IF NOT EXISTS record_id TEXT,
ADD COLUMN IF NOT EXISTS content TEXT,
ADD COLUMN IF NOT EXISTS embedding vector(50), -- Usamos 50 dims por compatibilidad con la función simulada local
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
