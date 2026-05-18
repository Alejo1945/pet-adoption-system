-- ============================================================
-- SISTEMA DE ADOPCIÓN DE MASCOTAS - Schema SQL para Supabase
-- Pegar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- 1. Habilitar extensión pgvector para búsqueda semántica
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'cliente' CHECK (role IN ('admin', 'cliente')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de mascotas (con embedding vectorial)
CREATE TABLE IF NOT EXISTS public.pets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  species TEXT NOT NULL CHECK (species IN ('perro', 'gato', 'conejo', 'ave', 'otro')),
  breed TEXT DEFAULT '',
  age INTEGER DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible', 'en_proceso', 'adoptado')),
  image_url TEXT DEFAULT '',
  embedding vector(50),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  latency_ms FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de solicitudes de adopción
CREATE TABLE IF NOT EXISTS public.adoption_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id UUID REFERENCES public.pets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobada', 'rechazada')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabla de logs de operaciones (errores, inserciones, etc.)
CREATE TABLE IF NOT EXISTS public.operation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT DEFAULT '',
  latency_ms FLOAT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabla de logs vectoriales (búsquedas semánticas)
CREATE TABLE IF NOT EXISTS public.vector_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type TEXT NOT NULL DEFAULT 'search',
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  query_text TEXT DEFAULT '',
  latency_ms FLOAT DEFAULT 0,
  similarity_score FLOAT DEFAULT 0,
  results_count INTEGER DEFAULT 0,
  embedding_time_ms FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tabla de mensajes del chat
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGER: Crear perfil automáticamente al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', public.profiles.full_name),
    role = COALESCE(NEW.raw_user_meta_data->>'role', public.profiles.role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adoption_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vector_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Profiles: cada usuario ve su propio perfil; admin ve todos
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Pets: todos los autenticados pueden ver; cualquiera puede insertar
DROP POLICY IF EXISTS "pets_select" ON public.pets;
CREATE POLICY "pets_select" ON public.pets FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "pets_insert" ON public.pets;
CREATE POLICY "pets_insert" ON public.pets FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "pets_update" ON public.pets;
CREATE POLICY "pets_update" ON public.pets FOR UPDATE
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "pets_delete" ON public.pets;
CREATE POLICY "pets_delete" ON public.pets FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Adoption requests
DROP POLICY IF EXISTS "requests_select" ON public.adoption_requests;
CREATE POLICY "requests_select" ON public.adoption_requests FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "requests_insert" ON public.adoption_requests;
CREATE POLICY "requests_insert" ON public.adoption_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "requests_update" ON public.adoption_requests;
CREATE POLICY "requests_update" ON public.adoption_requests FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Logs: todos pueden insertar; admin ve todos; usuario ve los suyos
DROP POLICY IF EXISTS "oplogs_select" ON public.operation_logs;
CREATE POLICY "oplogs_select" ON public.operation_logs FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "oplogs_insert" ON public.operation_logs;
CREATE POLICY "oplogs_insert" ON public.operation_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "vlogs_select" ON public.vector_logs;
CREATE POLICY "vlogs_select" ON public.vector_logs FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "vlogs_insert" ON public.vector_logs;
CREATE POLICY "vlogs_insert" ON public.vector_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Chat messages: usuario ve los suyos; admin ve todos
DROP POLICY IF EXISTS "chat_select" ON public.chat_messages;
CREATE POLICY "chat_select" ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "chat_insert" ON public.chat_messages;
CREATE POLICY "chat_insert" ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Función de búsqueda por similitud vectorial
-- ============================================================
CREATE OR REPLACE FUNCTION search_similar_pets(
  query_embedding vector(50),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  species TEXT,
  breed TEXT,
  age INTEGER,
  description TEXT,
  status TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.species, p.breed, p.age, p.description, p.status,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.pets p
  WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- ============================================================
-- Datos de ejemplo (opcional, comentar si no se necesitan)
-- ============================================================
-- Los datos se insertarán desde la aplicación.
-- Para probar, puedes crear un usuario admin desde la interfaz.
