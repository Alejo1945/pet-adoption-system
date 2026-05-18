'use client'

import { AIAgentChat } from '@/components/ai-agent-chat'

export default function ChatPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-4xl mx-auto py-4">
      <div className="flex-1 w-full h-full">
        <AIAgentChat isWidget={false} />
      </div>
    </div>
  )
}
