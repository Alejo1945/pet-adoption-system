'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface AdoptionRequest {
  id: string
  status: string
  notes: string
  created_at: string
  pets: { name: string; species: string; breed: string }
  profiles: { full_name: string }
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" /> },
  aprobada: { label: 'Aprobada', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" /> },
}

const speciesEmoji: Record<string, string> = {
  perro: '🐕', gato: '🐈', conejo: '🐇', ave: '🦜', otro: '🐾'
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<AdoptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const res = await fetch('/api/adoption-requests')
    const data = await res.json()
    setRequests(data.requests ?? [])
    setLoading(false)
  }

  async function updateStatus(requestId: string, status: 'aprobada' | 'rechazada') {
    setUpdating(requestId)
    const res = await fetch('/api/adoption-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, status }),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success(`Solicitud ${status === 'aprobada' ? 'aprobada' : 'rechazada'} exitosamente`)
      fetchRequests()
    } else {
      toast.error(data.error)
    }
    setUpdating(null)
  }

  const pending = requests.filter(r => r.status === 'pendiente')
  const processed = requests.filter(r => r.status !== 'pendiente')

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Solicitudes de Adopción</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {pending.length} pendientes · {processed.length} procesadas
        </p>
      </div>

      {/* Pendientes */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-500" />
            Pendientes de revisión ({pending.length})
          </h2>
          {pending.map((req) => (
            <Card key={req.id} className="border-yellow-200">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{speciesEmoji[req.pets?.species] ?? '🐾'}</span>
                      <div>
                        <p className="font-semibold">{req.pets?.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {req.pets?.species}{req.pets?.breed ? ` · ${req.pets.breed}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Solicitante: </span>
                      <span className="font-medium">{req.profiles?.full_name}</span>
                    </div>
                    {req.notes && (
                      <p className="text-sm text-muted-foreground italic">"{req.notes}"</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString('es-MX', {
                        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2 sm:flex-col">
                    <Button
                      size="sm"
                      onClick={() => updateStatus(req.id, 'aprobada')}
                      disabled={updating === req.id}
                      className="gap-2 bg-green-600 hover:bg-green-700"
                    >
                      {updating === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => updateStatus(req.id, 'rechazada')}
                      disabled={updating === req.id}
                      className="gap-2"
                    >
                      <XCircle className="h-3 w-3" />
                      Rechazar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Procesadas */}
      {processed.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-base">Solicitudes procesadas ({processed.length})</h2>
          {processed.map((req) => {
            const s = statusConfig[req.status]
            return (
              <Card key={req.id} className="opacity-80">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{speciesEmoji[req.pets?.species] ?? '🐾'}</span>
                      <div>
                        <p className="font-medium text-sm">{req.pets?.name}</p>
                        <p className="text-xs text-muted-foreground">{req.profiles?.full_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s?.color}`}>
                        {s?.icon}
                        {s?.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4">📋</span>
          <h3 className="text-lg font-semibold mb-2">No hay solicitudes</h3>
          <p className="text-muted-foreground">Las solicitudes de adopción aparecerán aquí</p>
        </div>
      )}
    </div>
  )
}
