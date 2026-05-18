'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { User, Mail, Shield, Loader2, CheckCircle2, PawPrint, ClipboardList, Heart } from 'lucide-react'
import { toast } from 'sonner'

interface ProfileData {
  id: string
  email: string
  full_name: string
  role: string
  created_at: string
}

interface Stats {
  myPets: number
  myRequests: number
  myFavorites: number
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [stats, setStats] = useState<Stats>({ myPets: 0, myRequests: 0, myFavorites: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/profile').then(r => r.json()),
      fetch('/api/pets').then(r => r.json()),
      fetch('/api/adoption-requests').then(r => r.json()),
      fetch('/api/favorites').then(r => r.json()),
    ]).then(([profileData, petsData, requestsData, favData]) => {
      setProfile(profileData.profile)
      setFullName(profileData.profile?.full_name ?? '')
      setStats({
        myPets: petsData.pets?.length ?? 0,
        myRequests: requestsData.requests?.length ?? 0,
        myFavorites: favData.favorites?.length ?? 0,
      })
      setLoading(false)
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { toast.error('El nombre no puede estar vacío'); return }
    setSaving(true)

    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName }),
    })

    if (res.ok) {
      toast.success('Perfil actualizado correctamente')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setProfile(prev => prev ? { ...prev, full_name: fullName } : prev)
    } else {
      const data = await res.json()
      toast.error(data.error ?? 'Error al actualizar')
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  const isAdmin = profile?.role === 'admin'
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })
    : '-'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mi Perfil</h1>
        <p className="text-muted-foreground text-sm mt-1">Administra tu información personal</p>
      </div>

      {/* Avatar + info básica */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
              {(profile?.full_name || profile?.email || 'U')[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{profile?.full_name || 'Sin nombre'}</h2>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isAdmin ? 'bg-primary/10 text-primary' : 'bg-green-100 text-green-700'}`}>
                  <Shield className="h-3 w-3" />
                  {isAdmin ? 'Administrador' : 'Cliente'}
                </span>
                <span className="text-xs text-muted-foreground">Miembro desde {memberSince}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas del cliente */}
      {!isAdmin && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <PawPrint className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-2xl font-bold">{stats.myPets}</p>
              <p className="text-xs text-muted-foreground">Registros</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <ClipboardList className="h-5 w-5 text-orange-500 mx-auto mb-1" />
              <p className="text-2xl font-bold">{stats.myRequests}</p>
              <p className="text-xs text-muted-foreground">Solicitudes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Heart className="h-5 w-5 text-rose-500 mx-auto mb-1" />
              <p className="text-2xl font-bold">{stats.myFavorites}</p>
              <p className="text-xs text-muted-foreground">Favoritos</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Editar nombre */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Editar información
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full-name">Nombre completo</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre completo"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                Correo electrónico
              </Label>
              <Input value={profile?.email ?? ''} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">El correo no se puede cambiar desde aquí</p>
            </div>

            <Button type="submit" disabled={saving || fullName === profile?.full_name} className="w-full gap-2">
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</>
                : saved
                  ? <><CheckCircle2 className="h-4 w-4" />¡Guardado!</>
                  : 'Guardar cambios'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Info de cuenta */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Tu rol de <strong>{isAdmin ? 'Administrador' : 'Cliente'}</strong> fue asignado al registrarte y no puede modificarse desde aquí.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
