'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Heart, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface FavoritePet {
  pet_id: string
  created_at: string
  pets: {
    id: string
    name: string
    species: string
    breed: string
    age: number
    description: string
    status: string
  }
}

const speciesEmoji: Record<string, string> = {
  perro: '🐕', gato: '🐈', conejo: '🐇', ave: '🦜', otro: '🐾'
}
const statusColor: Record<string, string> = {
  disponible: 'text-green-700 bg-green-100',
  en_proceso: 'text-yellow-700 bg-yellow-100',
  adoptado: 'text-blue-700 bg-blue-100',
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoritePet[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => { fetchFavorites() }, [])

  async function fetchFavorites() {
    const res = await fetch('/api/favorites')
    const data = await res.json()
    setFavorites(data.favorites ?? [])
    setLoading(false)
  }

  async function removeFavorite(petId: string) {
    setRemoving(petId)
    const res = await fetch('/api/favorites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pet_id: petId }),
    })
    if (res.ok) {
      toast.success('Eliminado de favoritos')
      setFavorites(prev => prev.filter(f => f.pet_id !== petId))
    } else {
      toast.error('Error al eliminar')
    }
    setRemoving(null)
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Heart className="h-6 w-6 text-rose-500" />
          Mis Favoritos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {favorites.length} mascota{favorites.length !== 1 ? 's' : ''} guardada{favorites.length !== 1 ? 's' : ''}
        </p>
      </div>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Heart className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No tienes favoritos</h3>
          <p className="text-muted-foreground mb-4">
            Explora las mascotas y guarda las que más te gusten con el ❤️
          </p>
          <Link href="/dashboard/pets">
            <Button>Ver mascotas</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map(({ pet_id, pets: pet }) => (
            <Card key={pet_id} className="relative group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{speciesEmoji[pet.species] ?? '🐾'}</span>
                    <div>
                      <h3 className="font-semibold">{pet.name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">
                        {pet.species}{pet.breed ? ` · ${pet.breed}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor[pet.status] ?? ''}`}>
                    {pet.status.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {pet.description}
                </p>

                <div className="flex gap-2">
                  <Link href={`/dashboard/pets/${pet.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      Ver detalles
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFavorite(pet_id)}
                    disabled={removing === pet_id}
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                  >
                    {removing === pet_id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>

                {pet.status === 'disponible' && (
                  <Link href={`/dashboard/pets/${pet.id}`} className="block mt-2">
                    <Button size="sm" className="w-full gap-2">
                      <Heart className="h-3 w-3" />
                      Solicitar adopción
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
