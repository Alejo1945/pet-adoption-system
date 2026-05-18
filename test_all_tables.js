const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function testAll() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const envUrl = envFile.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
  const envKey = envFile.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')).split('=')[1].trim();

  const supabase = createClient(envUrl, envKey);

  console.log("=== DIAGNÓSTICO DE BASE DE DATOS ===");

  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  console.log("1. PROFILES COUNT:", profiles ? profiles.length : 0, profiles, pErr);

  const { data: pets, error: petErr } = await supabase.from('pets').select('*');
  console.log("2. PETS COUNT:", pets ? pets.length : 0, pets, petErr);

  const { data: requests, error: rErr } = await supabase.from('adoption_requests').select('*');
  console.log("3. ADOPTION REQUESTS COUNT:", requests ? requests.length : 0, requests, rErr);

  const { data: notifications, error: nErr } = await supabase.from('notifications').select('*');
  console.log("4. NOTIFICATIONS COUNT:", notifications ? notifications.length : 0, notifications, nErr);

  const { data: favorites, error: fErr } = await supabase.from('favorites').select('*');
  console.log("5. FAVORITES COUNT:", favorites ? favorites.length : 0, favorites, fErr);
}

testAll().catch(console.error);
