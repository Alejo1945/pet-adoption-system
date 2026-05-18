'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Heart, Loader2, PawPrint, Calendar, Tag, User, Edit, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Pet {
  id: string
  name: string
  species: string
  breed: string
  age: number
  description: string
  status: string
  created_at: string
  user_id: string
  latency_ms: number
  profiles?: { full_name: string }
}

const speciesEmoji: Record<string, string> = {
  perro: '🐕', gato: '🐈', conejo: '🐇', ave: '🦜', otro: '🐾'
}

export default function PetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [pet, setPet] = useState<Pet | null>(null)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [notes, setNotes] = useState('')
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // Estados para Edición (Solo Admin)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    species: 'perro',
    breed: '',
    age: '0',
    description: '',
    status: 'disponible'
  })

  const fetchPet = useCallback(async () => {
    const res = await fetch(`/api/pets/${id}`)
    if (!res.ok) { router.push('/dashboard/pets'); return }
    const data = await res.json()
    setPet(data.pet)
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    fetchPet()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      const userRole = user?.user_metadata?.role ?? 'cliente'
      setIsAdmin(userRole === 'admin')
      
      if (userRole !== 'admin') {
        fetch('/api/favorites').then(r => r.json()).then(d => {
          const favIds = (d.favorites ?? []).map((f: { pet_id: string }) => f.pet_id)
          setIsFavorite(favIds.includes(id))
        })
      }
    })
  }, [fetchPet, id])

  const toggleFavorite = async () => {
    setFavLoading(true)
    if (isFavorite) {
      const res = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pet_id: id }),
      })
      if (res.ok) { setIsFavorite(false); toast.success('Eliminado de favoritos') }
    } else {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pet_id: id }),
      })
      if (res.ok) { setIsFavorite(true); toast.success('¡Guardado en favoritos! ❤️') }
      else { const d = await res.json(); toast.error(d.error) }
    }
    setFavLoading(false)
  }

  const handleAdoptionRequest = async () => {
    setRequesting(true)
    const res = await fetch('/api/adoption-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pet_id: id, notes }),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success('¡Solicitud enviada! El administrador la revisará pronto.')
      setShowRequestForm(false)
      fetchPet()
    } else {
      toast.error(data.error)
    }
    setRequesting(false)
  }

  // Activar modo edición cargando datos
  const startEditing = () => {
    if (!pet) return
    setEditForm({
      name: pet.name,
      species: pet.species,
      breed: pet.breed || '',
      age: String(pet.age),
      description: pet.description,
      status: pet.status
    })
    setIsEditing(true)
  }

  // Guardar cambios
  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(`/api/pets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    })
    const data = await res.json()
    if (res.ok) {
      toast.success('¡Datos de la mascota actualizados con éxito!')
      setIsEditing(false)
      fetchPet()
    } else {
      toast.error(data.error || 'Error al guardar los cambios')
    }
    setSaving(false)
  }

  // Eliminar mascota
  const handleDeletePet = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta mascota del sistema? Esta acción no se puede deshacer.')) return
    setDeleting(true)
    const res = await fetch(`/api/pets/${id}`, {
      method: 'DELETE'
    })
    if (res.ok) {
      toast.success('Mascota eliminada del sistema')
      router.push('/dashboard/pets')
    } else {
      const data = await res.json()
      toast.error(data.error || 'Error al eliminar la mascota')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!pet) return null

  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    disponible: { label: 'Disponible', variant: 'default' },
    en_proceso: { label: 'En proceso', variant: 'secondary' },
    adoptado: { label: 'Adoptado', variant: 'outline' },
  }

  const s = statusConfig[pet.status] ?? { label: pet.status, variant: 'outline' as const }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Barra superior */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/pets">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>

        {/* Acciones de Admin (Editar / Eliminar) */}
        {isAdmin && (
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={startEditing} className="gap-2">
                  <Edit className="h-4 w-4" />
                  Editar
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDeletePet} disabled={deleting} className="gap-2">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Eliminar
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
            )}
          </div>
        )}

        {/* Acciones de Cliente (Guardar en favoritos) */}
        {!isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFavorite}
            disabled={favLoading}
            className={`gap-2 transition-colors ${isFavorite ? 'border-rose-300 text-rose-600 hover:bg-rose-50' : 'hover:border-rose-300 hover:text-rose-600'}`}
          >
            {favLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Heart className={`h-4 w-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />}
            {isFavorite ? 'En favoritos' : 'Guardar'}
          </Button>
        )}
      </div>

      <Card>
        {/* MODO EDICIÓN (SOLO ADMIN) */}
        {isEditing ? (
          <form onSubmit={handleSaveChanges}>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Edit className="h-5 w-5 text-primary" /> Editar Registro de {pet.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nombre</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-species">Especie</Label>
                  <Select
                    value={editForm.species}
                    onValueChange={(val) => setEditForm({ ...editForm, species: val })}
                  >
                    <SelectTrigger id="edit-species">
                      <SelectValue placeholder="Selecciona especie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="perro">🐕 Perro</SelectItem>
                      <SelectItem value="gato">🐈 Gato</SelectItem>
                      <SelectItem value="conejo">🐇 Conejo</SelectItem>
                      <SelectItem value="ave">🦜 Ave</SelectItem>
                      <SelectItem value="otro">🐾 Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-breed">Raza</Label>
                  <Input
                    id="edit-breed"
                    value={editForm.breed}
                    placeholder="Ej. Golden Retriever, Mestizo"
                    onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-age">Edad (Años)</Label>
                  <Input
                    id="edit-age"
                    type="number"
                    min="0"
                    max="30"
                    value={editForm.age}
                    onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="edit-status">Estado de Adopción</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(val) => setEditForm({ ...editForm, status: val })}
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue placeholder="Selecciona estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disponible">🟢 Disponible</SelectItem>
                      <SelectItem value="en_proceso">⏳ En proceso</SelectItem>
                      <SelectItem value="adoptado">🎉 Adoptado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="edit-desc">Descripción</Label>
                  <Textarea
                    id="edit-desc"
                    value={editForm.description}
                    rows={4}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar Cambios
                </Button>
              </div>
            </CardContent>
          </form>
        ) : (
          /* MODO VISTA (NORMAL) */
          <>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-5xl">{speciesEmoji[pet.species] ?? '🐾'}</span>
                  <div>
                    <CardTitle className="text-2xl">{pet.name}</CardTitle>
                    <p className="text-muted-foreground capitalize mt-1">
                      {pet.species}{pet.breed ? ` · ${pet.breed}` : ''}
                    </p>
                  </div>
                </div>
                <Badge variant={s.variant}>{s.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Tag className="h-4 w-4" />
                  <span className="capitalize">{pet.species}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <PawPrint className="h-4 w-4" />
                  <span>{pet.age > 0 ? `${pet.age} año${pet.age !== 1 ? 's' : ''}` : 'Cachorro'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>Registrado por: {pet.profiles?.full_name ?? 'Usuario'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(pet.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Descripción</h3>
                <p className="text-muted-foreground leading-relaxed">{pet.description}</p>
              </div>



              {pet.status === 'disponible' && !isAdmin && (
                <div className="space-y-3">
                  {!showRequestForm ? (
                    <Button onClick={() => setShowRequestForm(true)} className="w-full gap-2">
                      <Heart className="h-4 w-4" />
                      Solicitar Adopción
                    </Button>
                  ) : (
                    <div className="space-y-3 rounded-lg border p-4">
                      <h4 className="font-medium">¿Por qué quieres adoptar a {pet.name}?</h4>
                      <Textarea
                        placeholder="Cuéntanos sobre tu hogar y por qué serías un buen adoptante (opcional)..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setShowRequestForm(false)} className="flex-1">
                          Cancelar
                        </Button>
                        <Button onClick={handleAdoptionRequest} disabled={requesting} className="flex-1 gap-2">
                          {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
                          Enviar Solicitud
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {pet.status === 'en_proceso' && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center text-sm text-yellow-800">
                  ⏳ Esta mascota tiene una solicitud de adopción en proceso.
                </div>
              )}

              {pet.status === 'adoptado' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center text-sm text-blue-800">
                  🎉 ¡Esta mascota ya fue adoptada! Encuentra otras en la lista.
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
