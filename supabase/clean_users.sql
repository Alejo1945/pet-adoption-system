-- ============================================================
-- PASO 1: Borrar todos los perfiles existentes
-- ============================================================
DELETE FROM public.profiles;

-- ============================================================
-- PASO 2: Borrar todos los usuarios de auth
-- (Hacerlo desde el Dashboard de Supabase es más fácil,
--  pero este SQL también funciona)
-- ============================================================
DELETE FROM auth.users;

-- ============================================================
-- PASO 3: Verificar que quedó limpio
-- ============================================================
SELECT COUNT(*) as perfiles FROM public.profiles;
SELECT COUNT(*) as usuarios FROM auth.users;
