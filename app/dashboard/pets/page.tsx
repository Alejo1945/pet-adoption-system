'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, Filter } from 'lucide-react'
import { toast } from 'sonner'

interface Pet {
  id: string
  name: string
  species: string
  breed: string
  age: number
  description: string
  status: string
  created_at: string
  profiles?: { full_name: string }
}

const speciesEmoji: Record<string, string> = {
  perro: '🐕', gato: '🐈', conejo: '🐇', ave: '🦜', otro: '🐾'
}
const statusColor: Record<string, string> = {
  disponible: 'text-green-700 bg-green-100',
  en_proceso: 'text-yellow-700 bg-yellow-100',
  adoptado: 'text-blue-700 bg-blue-100',
}

export default function PetsPage() {
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [searching, setSearching] = useState(false)
  const [semanticResults, setSemanticResults] = useState<Pet[] | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin((user?.user_metadata?.role ?? 'cliente') === 'admin')
    })
    fetchPets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch cuando cambian los filtros
  useEffect(() => {
    if (!loading) fetchPets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesFilter, statusFilter])

  async function fetchPets() {
    setLoading(true)
    setError(null)
    setSemanticResults(null)
    const params = new URLSearchParams()
    if (speciesFilter !== 'todos') params.set('species', speciesFilter)
    if (statusFilter !== 'todos') params.set('status', statusFilter)
    try {
      const res = await fetch(`/api/pets?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al cargar mascotas')
        setPets([])
      } else {
        setPets(data.pets ?? [])
      }
    } catch {
      setError('Error de conexión')
    }
    setLoading(false)
  }

  async function handleSemanticSearch() {
    if (!search.trim()) { fetchPets(); return }
    setSearching(true)
    setSemanticResults(null)
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: search, threshold: 0.2, limit: 10 }),
    })
    const data = await res.json()
    if (res.ok) {
      setSemanticResults(data.results)
      if (data.results.length === 0) toast.info('No se encontraron mascotas similares')
      else toast.success(`${data.results.length} resultados — ${data.meta.latency_ms}ms`)
    } else {
      toast.error(data.error)
    }
    setSearching(false)
  }

  const displayPets = semanticResults !== null
    ? semanticResults
    : pets.filter(p => search === '' || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mascotas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {semanticResults !== null
              ? `${semanticResults.length} resultados semánticos para "${search}"`
              : `${displayPets.length} mascotas encontradas`}
          </p>
        </div>
        {/* Solo admin puede registrar */}
        {isAdmin && (
          <Link href="/dashboard/pets/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Registrar
            </Button>
          </Link>
        )}
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o descripción semántica..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={handleSemanticSearch} disabled={searching} className="gap-2">
          <Search className="h-4 w-4" />
          {searching ? 'Buscando...' : 'Búsqueda IA'}
        </Button>
        <Select value={speciesFilter} onValueChange={setSpeciesFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="perro">🐕 Perros</SelectItem>
            <SelectItem value="gato">🐈 Gatos</SelectItem>
            <SelectItem value="conejo">🐇 Conejos</SelectItem>
            <SelectItem value="ave">🦜 Aves</SelectItem>
            <SelectItem value="otro">🐾 Otros</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="disponible">Disponible</SelectItem>
            <SelectItem value="en_proceso">En proceso</SelectItem>
            <SelectItem value="adoptado">Adoptado</SelectItem>
          </SelectContent>
        </Select>
        {semanticResults !== null && (
          <Button variant="ghost" onClick={() => { setSemanticResults(null); setSearch('') }}>
            Limpiar
          </Button>
        )}
      </div>

      {/* Error visible */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          ⚠️ {error}
        </div>
      )}

      {/* Grid de mascotas */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded mb-3 w-3/4" />
                <div className="h-4 bg-muted rounded mb-2 w-1/2" />
                <div className="h-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : displayPets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-6xl mb-4">🐾</span>
          {isAdmin ? (
            <>
              <h3 className="text-lg font-semibold mb-2">No hay mascotas registradas</h3>
              <p className="text-muted-foreground mb-4">Sé el primero en registrar una mascota</p>
              <Link href="/dashboard/pets/new">
                <Button>Registrar mascota</Button>
              </Link>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-2">No hay mascotas disponibles</h3>
              <p className="text-muted-foreground mb-4">En este momento no hay mascotas disponibles para adopción</p>
              <Button variant="outline" onClick={fetchPets}>Actualizar</Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayPets.map((pet) => (
            <Link key={pet.id} href={`/dashboard/pets/${pet.id}`}>
              <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/40 h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">{speciesEmoji[pet.species] ?? '🐾'}</span>
                      <div>
                        <h3 className="font-semibold text-base leading-tight">{pet.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">
                          {pet.species}{pet.breed ? ` · ${pet.breed}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor[pet.status] ?? ''}`}>
                      {pet.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {pet.description}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{pet.age > 0 ? `${pet.age} año${pet.age !== 1 ? 's' : ''}` : 'Cachorro'}</span>
                    <span>{new Date(pet.created_at).toLocaleDateString('es-MX')}</span>
                  </div>
                  {'similarity' in pet && (
                    <div className="mt-2 text-xs text-primary font-medium">
                      Similitud: {((pet as Pet & { similarity: number }).similarity * 100).toFixed(0)}%
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
