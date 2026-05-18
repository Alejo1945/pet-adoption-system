const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function testDB() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const envUrl = envFile.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
  
  // Buscar key de service role
  const keyLine = envFile.split('\n').find(l => l.includes('SUPABASE_SERVICE_ROLE_KEY'));
  if (!keyLine) {
    console.log("No se encontró SUPABASE_SERVICE_ROLE_KEY en .env.local");
    return;
  }
  const serviceKey = keyLine.split('=')[1].trim();

  console.log("Bypassing RLS with Service Role Key...");
  const supabase = createClient(envUrl, serviceKey);

  // 1. Consultar todos los favoritos
  const { data: favs, error: errFavs } = await supabase
    .from('favorites')
    .select('id, user_id, pet_id, created_at');
  
  console.log("\n=== FAVORITOS EN LA BD REAL ===");
  console.log(favs);
  if (errFavs) console.log("ERROR:", errFavs);

  // 2. Consultar perfiles
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, role');
  console.log("\n=== PERFILES EN LA BD REAL ===");
  console.log(profiles);

  // 3. Solicitudes de adopción
  const { data: reqs } = await supabase.from('adoption_requests').select('id, user_id, pet_id, status');
  console.log("\n=== SOLICITUDES EN LA BD REAL ===");
  console.log(reqs);
}

testDB().catch(console.error);
