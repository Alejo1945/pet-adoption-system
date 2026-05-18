const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function testRequests() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const envUrl = envFile.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
  const envKey = envFile.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')).split('=')[1].trim();

  const supabase = createClient(envUrl, envKey);

  console.log("Consultando solicitudes directas en la base de datos...");
  const { data, error } = await supabase
    .from('adoption_requests')
    .select('*, pets(name), profiles(full_name)');

  console.log("SOLICITUDES:", data);
  console.log("ERROR:", error);
}

testRequests().catch(console.error);
