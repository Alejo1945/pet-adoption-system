'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, CheckCircle, XCircle, Clock, History, ClipboardList } from 'lucide-react'
import Link from 'next/link'

interface AdoptionRequest {
  id: string
  status: string
  notes: string
  created_at: string
  updated_at: string
  pets: { id: string; name: string; species: string; breed: string }
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente: { label: 'Pendiente', color: 'text-yellow-700 bg-yellow-100', icon: <Clock className="h-3 w-3" /> },
  aprobada: { label: 'Aprobada ✅', color: 'text-green-700 bg-green-100', icon: <CheckCircle className="h-3 w-3" /> },
  rechazada: { label: 'Rechazada', color: 'text-red-700 bg-red-100', icon: <XCircle className="h-3 w-3" /> },
}

const speciesEmoji: Record<string, string> = {
  perro: '🐕', gato: '🐈', conejo: '🐇', ave: '🦜', otro: '🐾'
}

function RequestCard({ req }: { req: AdoptionRequest }) {
  const s = statusConfig[req.status]
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{speciesEmoji[req.pets?.species] ?? '🐾'}</span>
            <div>
              <p className="font-semibold">{req.pets?.name}</p>
              <p className="text-sm text-muted-foreground capitalize">
                {req.pets?.species}{req.pets?.breed ? ` · ${req.pets.breed}` : ''}
              </p>
              {req.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">"{req.notes}"</p>
              )}
            </div>
          </div>
          <div className="text-right space-y-1">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${s?.color}`}>
              {s?.icon}
              {s?.label}
            </span>
            <p className="text-xs text-muted-foreground">
              {new Date(req.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>

        {req.status === 'pendiente' && (
          <div className="mt-3 rounded-lg bg-yellow-50 border border-yellow-200 p-2 text-xs text-yellow-800">
            ⏳ Tu solicitud está siendo revisada por el administrador.
          </div>
        )}
        {req.status === 'aprobada' && (
          <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-2 text-xs text-green-800">
            🎉 ¡Felicidades! Tu solicitud fue aprobada. Pronto te contactarán.
          </div>
        )}
        {req.status === 'rechazada' && (
          <div className="mt-3 flex items-center justify-between">
            <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-800 flex-1">
              😔 Tu solicitud no fue aprobada.
            </div>
            <Link href="/dashboard/pets" className="ml-2">
              <Button size="sm" variant="outline">Ver más mascotas</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<AdoptionRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/adoption-requests')
      .then(r => r.json())
      .then(d => { setRequests(d.requests ?? []); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  const active = requests.filter(r => r.status === 'pendiente')
  const history = requests.filter(r => r.status !== 'pendiente')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mis Solicitudes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {active.length} activa{active.length !== 1 ? 's' : ''} · {history.length} en historial
        </p>
      </div>

      <Tabs defaultValue="activas">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="activas" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Activas ({active.length})
          </TabsTrigger>
          <TabsTrigger value="historial" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activas" className="space-y-3 mt-4">
          {active.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-semibold mb-1">No tienes solicitudes activas</h3>
              <p className="text-muted-foreground text-sm mb-4">Explora las mascotas y envía tu primera solicitud</p>
              <Link href="/dashboard/pets">
                <Button>Ver mascotas disponibles</Button>
              </Link>
            </div>
          ) : (
            active.map(req => <RequestCard key={req.id} req={req} />)
          )}
        </TabsContent>

        <TabsContent value="historial" className="space-y-3 mt-4">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-semibold mb-1">Sin historial todavía</h3>
              <p className="text-muted-foreground text-sm">Aquí aparecerán tus solicitudes aprobadas y rechazadas</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <History className="h-3 w-3" />
                Historial completo de adopciones
              </div>
              {history.map(req => <RequestCard key={req.id} req={req} />)}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
