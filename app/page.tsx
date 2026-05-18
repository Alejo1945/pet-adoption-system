import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PawPrint } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary">
          <PawPrint className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-bold text-balance text-foreground">
          Sistema de Adopcion de Mascotas
        </h1>
        <p className="max-w-md text-lg text-muted-foreground text-pretty">
          Encuentra tu companero ideal con nuestra plataforma inteligente de adopcion. 
          Busqueda semantica y agente IA para ayudarte en el proceso.
        </p>
      </div>
      <div className="flex gap-4">
        <Link href="/auth/login">
          <Button size="lg">Iniciar Sesion</Button>
        </Link>
        <Link href="/auth/sign-up">
          <Button size="lg" variant="outline">Registrarse</Button>
        </Link>
      </div>
    </div>
  )
}
