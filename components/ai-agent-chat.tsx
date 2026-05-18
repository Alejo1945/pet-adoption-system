'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, Loader2, Minimize2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface UserContext {
  user_id: string
  email: string
  role: string
  name: string
  conversation_id: string
}

export function AIAgentChat({ isWidget = false }: { isWidget?: boolean }) {
  const [open, setOpen] = useState(!isWidget)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userCtx, setUserCtx] = useState<UserContext | null>(null)
  const [initializing, setInitializing] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 1. Cargar usuario y configuración inicial
  useEffect(() => {
    async function initUser() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', session.user.id)
            .single()

          const role = profile?.role ?? session.user.user_metadata?.role ?? 'cliente'
          const name = profile?.full_name ?? session.user.user_metadata?.full_name ?? ''
          
          const ctx = {
            user_id: session.user.id,
            email: session.user.email ?? '',
            role,
            name,
            conversation_id: `${session.user.id}-${role}`
          }
          
          setUserCtx(ctx)
          await loadHistory(ctx, supabase)
        } else {
          // Usuario no logueado
          setMessages([{
            id: 'system-1',
            role: 'assistant',
            content: '¡Hola! 🐾 Inicia sesión para poder consultar datos del sistema.',
            timestamp: new Date()
          }])
        }
      } catch (err) {
        console.error('Error al inicializar usuario:', err)
      } finally {
        setInitializing(false)
      }
    }
    initUser()
  }, [])

  // Cargar historial de chat adaptativo
  const loadHistory = async (ctx: UserContext, supabase: any) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', ctx.user_id)
        .order('created_at', { ascending: true })

      if (error) throw error

      if (data && data.length > 0) {
        // Filtrar y parsear según el schema (adaptativo)
        const parsedMsgs: Message[] = []
        for (const row of data) {
          // Si el esquema es el original serializado en content
          if (row.content.startsWith('{')) {
            try {
              const parsed = JSON.parse(row.content)
              if (parsed.conversation_id === ctx.conversation_id) {
                parsedMsgs.push({
                  id: row.id,
                  role: row.role,
                  content: parsed.text || '',
                  timestamp: new Date(row.created_at)
                })
              }
            } catch {
              // si no es JSON válido, agregarlo como texto
              parsedMsgs.push({
                id: row.id,
                role: row.role,
                content: row.content,
                timestamp: new Date(row.created_at)
              })
            }
          } else {
            // Esquema con columnas nuevas o texto normal
            if (!row.conversation_id || row.conversation_id === ctx.conversation_id) {
              parsedMsgs.push({
                id: row.id,
                role: row.role,
                content: row.content,
                timestamp: new Date(row.created_at)
              })
            }
          }
        }
        
        
        if (parsedMsgs.length > 0) {
          console.log("LOAD history", { userId: ctx.user_id, conversationId: ctx.conversation_id, count: parsedMsgs.length });
          setMessages(parsedMsgs)
        } else {
          setInitialWelcomeMessage(ctx)
        }
      } else {
        setInitialWelcomeMessage(ctx)
      }
    } catch (err) {
      console.error('Error cargando historial:', err)
      setInitialWelcomeMessage(ctx)
    }
  }

  const setInitialWelcomeMessage = (ctx: UserContext) => {
    setMessages([{
      id: 'system-1',
      role: 'assistant',
      content: `¡Hola ${ctx.name}! 🐾 Soy el Asistente PetAdopt. ${ctx.role === 'admin' ? 'Como administrador, puedes registrar datos, consultar solicitudes globales y revisar métricas.' : 'Pregúntame sobre tus solicitudes, mascotas en adopción o consejos.'}`,
      timestamp: new Date()
    }])
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const clearChat = async () => {
    if (!userCtx) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai-chat/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userCtx.user_id, conversation_id: userCtx.conversation_id })
      })
      if (res.ok) {
        setMessages([])
        setInitialWelcomeMessage(userCtx)
        toast.success('Historial borrado correctamente de la base de datos.')
      } else {
        toast.error('Hubo un problema borrando el historial.')
      }
    } catch (e) {
      toast.error('Error de red al borrar historial.')
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !userCtx) return

    const tempId = Date.now().toString()
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: text,
      timestamp: new Date(),
    }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...userCtx
        }),
      })
      const data = await res.json()
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.ok && data.response ? data.response : '❌ Error al consultar. Intenta de nuevo.',
        timestamp: new Date(),
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Error de conexión al sistema.',
        timestamp: new Date(),
      }])
    }
    setLoading(false)
  }

  const unread = !open && messages.length > 1

  const ChatContent = (
    <div className={`flex flex-col bg-white dark:bg-zinc-900 border border-border overflow-hidden ${isWidget ? 'rounded-2xl shadow-2xl' : 'h-full rounded-2xl shadow-lg w-full relative'}`} 
         style={isWidget ? { width: 360, height: 550 } : {}}>
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-violet-600 text-white shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">PetBot AI ({userCtx?.role || '...'})</p>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-300 animate-pulse" />
            <span className="text-xs text-white/80">En línea</span>
          </div>
        </div>
        <button onClick={clearChat} className="rounded-full p-2 hover:bg-white/20 transition-colors" title="Limpiar vista de chat">
          <Trash2 className="h-4 w-4" />
        </button>
        {isWidget && (
          <button onClick={() => setOpen(false)} className="rounded-full p-1.5 hover:bg-white/20 transition-colors">
            <Minimize2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {initializing && (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-white text-xs
              ${msg.role === 'user' ? 'bg-violet-600' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
              {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed
              ${msg.role === 'user'
                ? 'bg-violet-600 text-white rounded-tr-sm'
                : 'bg-zinc-100 dark:bg-zinc-800 text-foreground rounded-tl-sm prose dark:prose-invert prose-sm max-w-none'}`}>
              {msg.role === 'user' ? (
                 <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                 <ReactMarkdown>{msg.content}</ReactMarkdown>
              )}
              <div className={`text-[10px] mt-1.5 opacity-60 ${msg.role === 'user' ? 'text-right' : ''}`}>
                {msg.timestamp.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
              <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 h-[42px] flex items-center">
              <div className="flex gap-1.5 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); sendMessage(input) }} className="flex gap-2 px-3 py-3 border-t bg-background shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pregúntale a PetBot..."
          disabled={loading || !userCtx}
          className="flex-1 rounded-full border bg-muted px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || !userCtx}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -ml-0.5" />}
        </button>
      </form>
    </div>
  )

  if (isWidget) {
    return (
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
        {open && ChatContent}
        <button
          onClick={() => setOpen(!open)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 hover:scale-110 transition-all duration-200"
        >
          {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          {unread && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold animate-bounce">
              !
            </span>
          )}
        </button>
      </div>
    )
  }

  return ChatContent
}
