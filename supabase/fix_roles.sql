-- Agregar política INSERT para profiles (necesaria para el upsert del callback)
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Corregir el rol de los usuarios existentes que registraron como admin
-- Esto lee el rol del user_metadata de Supabase Auth y lo aplica al perfil
UPDATE public.profiles p
SET role = COALESCE(
  (
    SELECT raw_user_meta_data->>'role'
    FROM auth.users u
    WHERE u.id = p.id
      AND raw_user_meta_data->>'role' IS NOT NULL
      AND raw_user_meta_data->>'role' != ''
  ),
  p.role
);

-- Verificar los resultados
SELECT p.id, p.full_name, p.role, u.email, u.raw_user_meta_data->>'role' as meta_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id;
