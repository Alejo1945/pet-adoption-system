import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardNav } from '@/components/dashboard-nav'
import { AIAgentChat } from '@/components/ai-agent-chat'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Leer rol del JWT (user_metadata) — siempre confiable
  const roleFromJWT = user.user_metadata?.role ?? 'cliente'
  const fullNameFromJWT = user.user_metadata?.full_name ?? ''

  const { data: profileFromDB } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Si el perfil existe en DB usarlo, pero el rol SIEMPRE viene del JWT
  const profile = {
    full_name: profileFromDB?.full_name || fullNameFromJWT,
    role: roleFromJWT, // Rol del JWT — lo que el usuario eligió al registrarse
  }

  // Si el perfil no existe en base de datos, lo creamos automáticamente al instante
  if (!profileFromDB) {
    console.log("BASE DE DATOS SINC: Creando perfil del dashboard...")
    const displayName = fullNameFromJWT || user.email?.split('@')[0] || 'Usuario'
    await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: displayName,
        role: roleFromJWT
      })
  } else if (profileFromDB.role !== roleFromJWT) {
    // Sincronizar el perfil en DB si hay discrepancia de rol
    await supabase
      .from('profiles')
      .update({ role: roleFromJWT })
      .eq('id', user!.id)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardNav user={user!} profile={profile} />
      <main className="flex-1 p-4 md:p-6">
        {children}
      </main>
      {/* Widget nativo del AI Router (PetBot) */}
      <AIAgentChat isWidget={true} />
    </div>
  )
}
