'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/notification-bell'
import {
  PawPrint, LayoutDashboard, Dog, MessageCircle, LogOut,
  ClipboardList, BarChart3, Heart, User, History
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'

interface DashboardNavProps {
  user: SupabaseUser
  profile: { full_name: string; role: string } | null
}

export function DashboardNav({ user, profile }: DashboardNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = profile?.role === 'admin'

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Navegación ADMIN — gestión total
  const adminNavItems = [
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
    { href: '/dashboard/pets', label: 'Mascotas', icon: Dog },
    { href: '/dashboard/chat', label: 'Agente IA', icon: MessageCircle },
    { href: '/dashboard/requests', label: 'Solicitudes', icon: ClipboardList },
    { href: '/dashboard/metrics', label: 'Métricas', icon: BarChart3 },
  ]

  // Navegación CLIENTE — exploración y adopción
  const clientNavItems = [
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
    { href: '/dashboard/pets', label: 'Mascotas', icon: Dog },
    { href: '/dashboard/favorites', label: 'Favoritos', icon: Heart },
    { href: '/dashboard/my-requests', label: 'Solicitudes', icon: History },
    { href: '/dashboard/chat', label: 'Agente IA', icon: MessageCircle },
    { href: '/dashboard/profile', label: 'Mi Perfil', icon: User },
  ]

  const navItems = isAdmin ? adminNavItems : clientNavItems

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <header className="sticky top-0 z-50 border-b bg-card">
      <div className="flex h-16 items-center gap-4 px-4 md:px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <PawPrint className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="hidden font-bold md:inline-block">PetAdopt</span>
        </Link>

        {/* Nav items */}
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive(item.href) ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-2 whitespace-nowrap"
              >
                <item.icon className={`h-4 w-4 ${item.icon === Heart && isActive(item.href) ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span className="hidden md:inline-block">{item.label}</span>
              </Button>
            </Link>
          ))}
        </nav>

        {/* Info de usuario */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden text-sm text-muted-foreground md:inline-block truncate max-w-[120px]">
            {profile?.full_name || user.email}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isAdmin
              ? 'bg-primary/10 text-primary'
              : 'bg-green-100 text-green-700'
          }`}>
            {isAdmin ? 'Admin' : 'Cliente'}
          </span>
          {/* Campana de notificaciones */}
          <NotificationBell />
          <Button variant="ghost" size="sm" onClick={handleSignOut} title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
