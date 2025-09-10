import React, { useState } from 'react'
import { useStore } from '@/store/useStore'

export function ChatPanel({ docId }: { docId: string }){
  const [q, setQ] = useState('')
  const msgs = useStore(s => s.messages[docId] || [])
  const send = useStore(s => s.send)

  return (
    <div style={{display:'contents'}}>
      <div className="chat-scroll">
        {msgs.length === 0 && <div className="msg bot"><div className="bubble">Ask something about this PDF…</div></div>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}><div className="bubble">{m.text}</div></div>
        ))}
      </div>
      <form className="composer" onSubmit={(e)=>{ e.preventDefault(); if(q.trim()){ send(q.trim()); setQ('') } }}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Type a question…"/>
        <button>Send</button>
      </form>
    </div>
  )
}
