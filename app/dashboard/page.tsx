import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dog, MessageCircle, ClipboardList, BarChart3, PawPrint, Plus, TrendingUp, Users, Heart } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Rol siempre desde JWT — confiable
  const isAdmin = (user.user_metadata?.role ?? 'cliente') === 'admin'
  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0]

  // Datos rápidos
  const [
    { count: totalPets },
    { count: myPets },
    { count: myRequests },
    { count: totalUsers },
    { count: availablePets },
    { count: myFavorites },
  ] = await Promise.all([
    supabase.from('pets').select('*', { count: 'exact', head: true }),
    supabase.from('pets').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
    supabase.from('adoption_requests').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('pets').select('*', { count: 'exact', head: true }).eq('status', 'disponible'),
    supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
  ])

  // Últimas mascotas
  const { data: recentPets } = await supabase
    .from('pets')
    .select('id, name, species, breed, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  const speciesEmoji: Record<string, string> = {
    perro: '🐕', gato: '🐈', conejo: '🐇', ave: '🦜', otro: '🐾'
  }
  const statusColor: Record<string, string> = {
    disponible: 'text-green-600 bg-green-50',
    en_proceso: 'text-yellow-600 bg-yellow-50',
    adoptado: 'text-blue-600 bg-blue-50',
  }

  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            ¡Bienvenido, {displayName}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? 'Panel de administración del sistema de adopción' : 'Explora las mascotas disponibles y solicita tu adopción'}
          </p>
        </div>
        {/* Solo el admin puede registrar mascotas */}
        {isAdmin && (
          <Link href="/dashboard/pets/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Registrar Mascota
            </Button>
          </Link>
        )}
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isAdmin ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Mascotas</CardTitle>
                <PawPrint className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalPets ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">{availablePets ?? 0} disponibles</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Usuarios</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalUsers ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Clientes registrados</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Disponibles</CardTitle>
                <Heart className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{availablePets ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Esperando un hogar</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Mis Registros</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{myPets ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Registradas por ti</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* CLIENTE: Solicitudes, Disponibles, Favoritos, Total */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Mis Solicitudes</CardTitle>
                <ClipboardList className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{myRequests ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Solicitudes de adopción</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Disponibles</CardTitle>
                <Heart className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{availablePets ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Para adoptar ahora</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Mis Favoritos</CardTitle>
                <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{myFavorites ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Mascotas guardadas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total en Sistema</CardTitle>
                <PawPrint className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalPets ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Mascotas registradas</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Accesos rápidos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/pets">
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Dog className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Ver Mascotas</p>
                <p className="text-sm text-muted-foreground">Explorar todas las mascotas</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/chat">
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                <MessageCircle className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold">Agente IA</p>
                <p className="text-sm text-muted-foreground">Consulta con inteligencia artificial</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={isAdmin ? '/dashboard/requests' : '/dashboard/my-requests'}>
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                <ClipboardList className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold">{isAdmin ? 'Solicitudes' : 'Mis Solicitudes'}</p>
                <p className="text-sm text-muted-foreground">
                  {isAdmin ? 'Gestionar solicitudes de adopción' : 'Ver estado de tus solicitudes'}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Acceso rápido para CLIENTE: Favoritos */}
        {!isAdmin && (
          <Link href="/dashboard/favorites">
            <Card className="cursor-pointer transition-all hover:shadow-md hover:border-rose-300">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/30">
                  <Heart className="h-6 w-6 text-rose-500" />
                </div>
                <div>
                  <p className="font-semibold">Mis Favoritos</p>
                  <p className="text-sm text-muted-foreground">Mascotas que te gustaron</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {isAdmin && (
          <Link href="/dashboard/metrics">
            <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <BarChart3 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold">Métricas</p>
                  <p className="text-sm text-muted-foreground">Dashboard completo del sistema</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* Últimas mascotas */}
      {recentPets && recentPets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas mascotas registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentPets.map((pet) => (
                <Link key={pet.id} href={`/dashboard/pets/${pet.id}`}>
                  <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{speciesEmoji[pet.species] ?? '🐾'}</span>
                      <div>
                        <p className="font-medium">{pet.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">{pet.species}{pet.breed ? ` · ${pet.breed}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor[pet.status] ?? ''}`}>
                        {pet.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(pet.created_at).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4">
              <Link href="/dashboard/pets">
                <Button variant="outline" className="w-full">Ver todas las mascotas</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
