import { create } from 'zustand'

export type Citation = { page_start: number; page_end: number; snippet?: string }
export type Overview = { topic: string; answer: string; citations: Citation[] }

export type Doc = {
  id: string
  name: string
  size?: number
  pages?: number
  blobUrl?: string | null
  overview?: Overview[]
  createdAt: number
}

type Message = { role: 'user' | 'bot'; text: string }

type State = {
  docs: Record<string, Doc>
  order: string[]
  selectedId: string | null

  messages: Record<string, Message[]>

  uploading: { total: number; done: number } | null

  select: (id: string) => void
  addFiles: (files: File[]) => Promise<void>
  removeDoc: (id: string) => void
  renameDoc: (id: string, name: string) => void

  send: (text: string) => Promise<void>
}

const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8080'

async function callIngest(file: File){
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API}/api/ingest`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('ingest failed')
  return await res.json() as { ok: boolean; doc_id: string; chunks: number; overview: Overview[] }
}

async function callAsk(doc_id: string, query: string){
  const res = await fetch(`${API}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_id, query, k: 6 })
  })
  if (!res.ok) throw new Error('ask failed')
  return await res.json() as { answer: string }
}

export const useStore = create<State>((set, get) => ({
  docs: {},
  order: [],
  selectedId: null,
  messages: {},
  uploading: null,

  select: (id) => set({ selectedId: id }),

  removeDoc: (id) => set(s => {
    const { [id]: _, ...rest } = s.docs
    return { docs: rest, order: s.order.filter(x => x !== id), selectedId: s.selectedId === id ? null : s.selectedId }
  }),

  renameDoc: (id, name) => set(s => ({ docs: { ...s.docs, [id]: { ...s.docs[id], name } } })),

  addFiles: async (files) => {
    if (!files.length) return
    set({ uploading: { total: files.length, done: 0 } })
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        const r = await callIngest(f)
        const id = r.doc_id
        const blobUrl = URL.createObjectURL(f)
        set(s => ({
          docs: { ...s.docs, [id]: { id, name: f.name, size: f.size, blobUrl, overview: r.overview, createdAt: Date.now() } },
          order: [id, ...s.order],
          selectedId: id,
          uploading: { total: files.length, done: i + 1 }
        }))
      } catch (e) {
        set(s => ({ uploading: { total: files.length, done: i + 1 } }))
      }
    }
    set({ uploading: null })
  },

  send: async (text) => {
    const id = get().selectedId
    if (!id) return
    set(s => ({ messages: { ...s.messages, [id]: [ ...(s.messages[id] || []), { role: 'user', text } ] } }))
    try {
      const r = await callAsk(id, text)
      set(s => ({ messages: { ...s.messages, [id]: [ ...(s.messages[id] || []), { role: 'bot', text: r.answer } ] } }))
    } catch (e: any) {
      set(s => ({ messages: { ...s.messages, [id]: [ ...(s.messages[id] || []), { role: 'bot', text: 'Error: ' + (e.message || String(e)) } ] } }))
    }
  },
}))