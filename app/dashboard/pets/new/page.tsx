'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PawPrint, ArrowLeft, Loader2, CheckCircle2, ShieldOff } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function NewPetPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      const role = user?.user_metadata?.role ?? 'cliente'
      setIsAdmin(role === 'admin')
    })
  }, [])

  const [form, setForm] = useState({
    name: '',
    species: '',
    breed: '',
    age: '',
    description: '',
  })

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors([])

    const clientErrors: string[] = []
    if (!form.name.trim()) clientErrors.push('El nombre es requerido')
    if (!form.species) clientErrors.push('La especie es requerida')
    if (!form.description.trim()) clientErrors.push('La descripción es requerida')
    if (form.description.trim().length < 10) clientErrors.push('La descripción debe tener al menos 10 caracteres')
    if (form.age && (isNaN(Number(form.age)) || Number(form.age) < 0)) clientErrors.push('La edad debe ser un número positivo')

    if (clientErrors.length > 0) {
      setErrors(clientErrors)
      setLoading(false)
      return
    }

    const res = await fetch('/api/pets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()

    if (!res.ok) {
      setErrors(data.errors ?? [data.error])
      toast.error('Error al registrar la mascota')
      setLoading(false)
      return
    }

    setSuccess(true)
    toast.success(`¡${form.name} registrada exitosamente!`)
    setTimeout(() => router.push('/dashboard/pets'), 1500)
  }

  // Cargando rol
  if (isAdmin === null) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  // Acceso denegado para clientes
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldOff className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold">Acceso restringido</h2>
        <p className="text-muted-foreground max-w-sm">
          Solo los administradores pueden registrar mascotas. Como cliente, puedes explorar las mascotas disponibles y solicitar una adopción.
        </p>
        <Button onClick={() => router.push('/dashboard/pets')}>
          Ver mascotas disponibles
        </Button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-bold">¡Mascota registrada!</h2>
        <p className="text-muted-foreground">Redirigiendo a la lista de mascotas...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/pets">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Registrar Mascota</h1>
          <p className="text-sm text-muted-foreground">Ingresa los datos de la mascota en adopción</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <PawPrint className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Nueva Mascota</CardTitle>
              <CardDescription>
                El embedding vectorial se generará automáticamente con la descripción
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="pet-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pet-name"
                placeholder="Ej: Max, Luna, Pelusa..."
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
              />
            </div>

            {/* Especie y Raza */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pet-species">
                  Especie <span className="text-destructive">*</span>
                </Label>
                <Select value={form.species} onValueChange={(v) => handleChange('species', v)} required>
                  <SelectTrigger id="pet-species">
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
                <Label htmlFor="pet-breed">Raza (opcional)</Label>
                <Input
                  id="pet-breed"
                  placeholder="Ej: Labrador, Siamés..."
                  value={form.breed}
                  onChange={(e) => handleChange('breed', e.target.value)}
                />
              </div>
            </div>

            {/* Edad */}
            <div className="space-y-2">
              <Label htmlFor="pet-age">Edad en años (opcional)</Label>
              <Input
                id="pet-age"
                type="number"
                min="0"
                max="30"
                placeholder="Ej: 2"
                value={form.age}
                onChange={(e) => handleChange('age', e.target.value)}
              />
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <Label htmlFor="pet-description">
                Descripción <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="pet-description"
                placeholder="Describe la personalidad, características y necesidades de la mascota... (mín. 10 caracteres)"
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                Una buena descripción mejora la búsqueda semántica. {form.description.length} caracteres.
              </p>
            </div>

            {/* Errores */}
            {errors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <p className="text-sm font-medium text-destructive mb-2">Por favor corrige los siguientes errores:</p>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((err, i) => (
                    <li key={i} className="text-sm text-destructive">{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Info de embedding */}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              🧠 <strong>Base vectorial:</strong> Se generará un embedding de 50 dimensiones a partir de la descripción para habilitar la búsqueda semántica.
            </div>

            <div className="flex gap-3">
              <Link href="/dashboard/pets" className="flex-1">
                <Button variant="outline" type="button" className="w-full">Cancelar</Button>
              </Link>
              <Button type="submit" disabled={loading} className="flex-1 gap-2">
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Procesando...</>
                ) : (
                  <><PawPrint className="h-4 w-4" />Registrar Mascota</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
