'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'
import {
  Database, Zap, AlertTriangle, CheckCircle2, MessageCircle,
  Target, Copy, HardDrive, Loader2, RefreshCw, Users, PawPrint, TrendingUp, Clock
} from 'lucide-react'
import { toast } from 'sonner'

interface Metrics {
  totalRecords: number
  recordsByUser: { user_id: string; full_name: string; count: number }[]
  avgInsertLatency: number
  insertErrors: number
  insertSuccessRate: number
  avgQueryLatency: number
  totalChatQueries: number
  avgSimilarityScore: number
  duplicatesDetected: number
  vectorStorageInfo: { count: number; dimensions: number }
  avgEmbeddingTime: number
  recordsByDate: { date: string; count: number }[]
  successfulChats: number
  emptyResults: number
  totalUsers: number
  availablePets: number
  adoptedPets: number
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']

function MetricCard({
  title, value, subtitle, icon: Icon, color = 'text-primary', badge
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color?: string
  badge?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {badge && (
          <span className="inline-block mt-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {badge}
          </span>
        )}
      </CardContent>
    </Card>
  )
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchMetrics = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    const res = await fetch('/api/metrics')
    if (res.ok) {
      const data = await res.json()
      setMetrics(data.metrics)
      if (isRefresh) toast.success('Métricas actualizadas')
    } else {
      toast.error('Error cargando métricas')
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchMetrics() }, [])

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm">Calculando métricas del sistema...</p>
    </div>
  )

  if (!metrics) return (
    <div className="text-center py-16 text-muted-foreground">No se pudieron cargar las métricas</div>
  )

  const pieData = [
    { name: 'Disponibles', value: metrics.availablePets },
    { name: 'Adoptadas', value: metrics.adoptedPets },
    { name: 'En proceso', value: metrics.totalRecords - metrics.availablePets - metrics.adoptedPets },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de Métricas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoreo completo del sistema — 10 métricas obligatorias
          </p>
        </div>
        <Button variant="outline" onClick={() => fetchMetrics(true)} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* ── SECCIÓN A: Resumen General ── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          A. Resumen General
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Métrica 1 */}
          <MetricCard
            title="1. Total de Registros"
            value={metrics.totalRecords}
            subtitle="Mascotas en la base vectorial"
            icon={PawPrint}
            badge="Métrica #1"
          />
          {/* Métrica 7 */}
          <MetricCard
            title="7. Consultas al Agente"
            value={metrics.totalChatQueries}
            subtitle="Preguntas realizadas al chat IA"
            icon={MessageCircle}
            color="text-purple-500"
            badge="Métrica #7"
          />
          {/* Métrica 5 */}
          <MetricCard
            title="5. Tasa de Éxito"
            value={`${metrics.insertSuccessRate}%`}
            subtitle="Inserciones exitosas vs intentos"
            icon={CheckCircle2}
            color="text-green-500"
            badge="Métrica #5"
          />
          {/* Métrica 4 */}
          <MetricCard
            title="4. Errores de Ingreso"
            value={metrics.insertErrors}
            subtitle="Intentos fallidos de inserción"
            icon={AlertTriangle}
            color="text-red-500"
            badge="Métrica #4"
          />
        </div>
      </section>

      {/* ── SECCIÓN B: Rendimiento Vectorial ── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          B. Rendimiento de la Base Vectorial
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Métrica 3 */}
          <MetricCard
            title="3. Latencia de Inserción"
            value={`${metrics.avgInsertLatency} ms`}
            subtitle="Tiempo promedio para insertar"
            icon={Clock}
            color="text-blue-500"
            badge="Métrica #3"
          />
          {/* Métrica 6 */}
          <MetricCard
            title="6. Latencia de Consulta"
            value={`${metrics.avgQueryLatency} ms`}
            subtitle="Tiempo promedio de búsqueda semántica"
            icon={Zap}
            color="text-amber-500"
            badge="Métrica #6"
          />
          {/* Métrica adicional: embedding time */}
          <MetricCard
            title="Tiempo de Embedding"
            value={`${metrics.avgEmbeddingTime} ms`}
            subtitle="Generación de vectores"
            icon={Database}
            color="text-indigo-500"
          />
          {/* Métrica 10 */}
          <MetricCard
            title="10. Almacenamiento Vectorial"
            value={metrics.vectorStorageInfo.count}
            subtitle={`Vectores de ${metrics.vectorStorageInfo.dimensions} dimensiones`}
            icon={HardDrive}
            color="text-violet-500"
            badge="Métrica #10"
          />
        </div>
      </section>

      {/* ── SECCIÓN C: Calidad de Datos ── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Target className="h-4 w-4" />
          C. Calidad de los Datos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Métrica 8 */}
          <MetricCard
            title="8. Precisión de Recuperación"
            value={`${metrics.avgSimilarityScore}%`}
            subtitle="Similitud promedio en búsquedas vectoriales"
            icon={Target}
            color="text-emerald-500"
            badge="Métrica #8"
          />
          {/* Métrica 9 */}
          <MetricCard
            title="9. Duplicados Detectados"
            value={metrics.duplicatesDetected}
            subtitle="Registros con similitud > 92%"
            icon={Copy}
            color="text-orange-500"
            badge="Métrica #9"
          />
          <MetricCard
            title="Consultas Exitosas"
            value={metrics.successfulChats}
            subtitle={`${metrics.emptyResults} sin resultados`}
            icon={CheckCircle2}
            color="text-green-500"
          />
        </div>
      </section>

      {/* ── GRÁFICOS ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Métrica 2: Registros por usuario */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              2. Registros por Usuario <span className="text-xs font-normal text-muted-foreground ml-1">Métrica #2</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.recordsByUser.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Sin datos aún
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.recordsByUser} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="full_name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    formatter={(v) => [v, 'Registros']}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Registros por fecha */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Actividad Reciente — Registros por Fecha</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.recordsByDate.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sin datos aún</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={metrics.recordsByDate} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Estado de mascotas - Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Estado de Mascotas</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sin datos aún</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Resumen del agente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Actividad del Agente Conversacional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                { label: 'Total de preguntas', value: metrics.totalChatQueries, color: 'bg-purple-500' },
                { label: 'Consultas con resultados', value: metrics.successfulChats, color: 'bg-green-500' },
                { label: 'Consultas sin resultados', value: metrics.emptyResults, color: 'bg-red-400' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-semibold">{item.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.color} transition-all`}
                      style={{ width: metrics.totalChatQueries > 0 ? `${(item.value / Math.max(metrics.totalChatQueries, 1)) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-purple-600">{metrics.totalUsers}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Users className="h-3 w-3" />
                  Usuarios totales
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{metrics.vectorStorageInfo.dimensions}D</p>
                <p className="text-xs text-muted-foreground">Dimensiones del embedding</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de usuarios */}
      {metrics.recordsByUser.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Detalle de Actividad por Usuario</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">#</th>
                    <th className="pb-2 font-medium text-muted-foreground">Usuario</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Registros</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recordsByUser
                    .sort((a, b) => b.count - a.count)
                    .map((u, i) => (
                      <tr key={u.user_id} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 font-medium">{u.full_name}</td>
                        <td className="py-2 text-right">{u.count}</td>
                        <td className="py-2 text-right text-muted-foreground">
                          {metrics.totalRecords > 0 ? ((u.count / metrics.totalRecords) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
