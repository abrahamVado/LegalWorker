// useStore.ts
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
  /** folder-aware path (webkitRelativePath or fallback to name) */
  path?: string
}

type Message = { role: 'user' | 'bot'; text: string }

// handy for TS to accept webkitRelativePath
type FileWithPath = File & { webkitRelativePath?: string }

type State = {
  docs: Record<string, Doc>
  order: string[]
  selectedId: string | null
  messages: Record<string, Message[]>
  uploading: { total: number; done: number } | null

  // actions
  select: (id: string) => void
  setSelectedId?: (id: string) => void // <-- optional alias
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

/** ===== Folder tree helpers (exported) ===== */
export type TreeNode = {
  id: string
  name: string
  path: string
  type: 'dir' | 'file'
  children?: TreeNode[]
  fileId?: string
}

export function buildTreeFromDocs(docs: Record<string, Doc>, order: string[]): TreeNode {
  const root: TreeNode = { id: 'root', name: 'Workspace', path: '', type: 'dir', children: [] } // name tidier
  const dirMap = new Map<string, TreeNode>([['', root]])

  const ids = [...order]
  for (const id of ids) {
    const d = docs[id]
    if (!d) continue
    // prefer folder path; fallback: name at root
    const parts = (d.path || d.name || '').split('/').filter(Boolean)
    if (parts.length === 0) {
      // no path at all -> put file at root
      root.children!.push({ id: `f:${id}`, name: d.name, path: d.name, type: 'file', fileId: id })
      continue
    }

    let parent = root
    let cur = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      cur = cur ? `${cur}/${part}` : part
      const isLast = i === parts.length - 1

      if (isLast && part.toLowerCase().endsWith('.pdf')) {
        parent.children ||= []
        parent.children.push({ id: `f:${id}`, name: part, path: cur, type: 'file', fileId: id })
      } else {
        const key = `d:${cur}`
        let dir = dirMap.get(key)
        if (!dir) {
          dir = { id: key, name: part, path: cur, type: 'dir', children: [] }
          parent.children ||= []
          parent.children.push(dir)
          dirMap.set(key, dir)
        }
        parent = dir
      }
    }
  }

  const sortRec = (node: TreeNode) => {
    if (!node.children) return
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    node.children.forEach(sortRec)
  }
  sortRec(root)
  return root
}

/** ===== Quick Dashboard mapper (exported) ===== */
export type QuickDash = {
  counterparts: string[]
  dates: string[]
  money: Array<{ amount: number; currency: string; context?: string }>
  places: string[]
  errors: string[]
}

export function mapOverviewToQuick(ov?: Overview[]): QuickDash {
  const quick: QuickDash = { counterparts: [], dates: [], money: [], places: [], errors: [] }
  if (!ov?.length) return quick

  const moneyRx = /\b(\$|MXN|USD|EUR)\s?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)\b/gi
  const dateRx = /\b(20[0-9]{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12][0-9]|3[01])|(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12][0-9]|3[01])[-/]20[0-9]{2})\b/g

  for (const item of ov) {
    const t = item.topic.toLowerCase()
    const a = item.answer || ''

    if (t.includes('counterpart') || t.includes('partes') || t.includes('contraparte')) {
      quick.counterparts.push(...a.split(/[;,•\n]/).map(s => s.trim()).filter(Boolean))
    }
    if (t.includes('fecha') || t.includes('date')) {
      quick.dates.push(...(a.match(dateRx) || []))
    }
    if (t.includes('monto') || t.includes('cantidad') || t.includes('importe') || t.includes('amount')) {
      for (const m of a.matchAll(moneyRx)) {
        const sym = (m[1] || '').toUpperCase()
        const raw = (m[2] || '').replace(/[.,](?=[0-9]{3}\b)/g, '').replace(',', '.')
        const amount = Number(raw)
        if (!Number.isFinite(amount)) continue
        // prefer explicit code in the text; else map $ -> USD by default
        const currency = /MXN/i.test(m[0]) ? 'MXN'
          : /EUR/i.test(m[0]) ? 'EUR'
          : /USD/i.test(m[0]) ? 'USD'
          : sym === '$' ? 'USD' : sym
        quick.money.push({ amount, currency })
      }
    }
    if (t.includes('lugar') || t.includes('domicilio') || t.includes('place') || t.includes('ubicación')) {
      quick.places.push(...a.split(/[;,•\n]/).map(s => s.trim()).filter(Boolean))
    }
    if (t.includes('error') || t.includes('inconsistencia') || t.includes('issue')) {
      quick.errors.push(...a.split(/[;\n]/).map(s => s.trim()).filter(Boolean))
    }
  }

  quick.counterparts = Array.from(new Set(quick.counterparts))
  quick.dates = Array.from(new Set(quick.dates))
  quick.places = Array.from(new Set(quick.places))
  return quick
}

export const useStore = create<State>((set, get) => ({
  docs: {},
  order: [],
  selectedId: null,
  messages: {},
  uploading: null,

  select: (id) => set({ selectedId: id }),
  setSelectedId: (id) => set({ selectedId: id }), // <-- alias

  removeDoc: (id) => set(s => {
    const { [id]: removed, ...rest } = s.docs
    // revoke blob url to free memory
    if (removed?.blobUrl) {
      try { URL.revokeObjectURL(removed.blobUrl) } catch {}
    }
    return {
      docs: rest,
      order: s.order.filter(x => x !== id),
      selectedId: s.selectedId === id ? null : s.selectedId
    }
  }),

  renameDoc: (id, name) => set(s => ({ docs: { ...s.docs, [id]: { ...s.docs[id], name } } })),

  addFiles: async (files) => {
    if (!files.length) return
    set({ uploading: { total: files.length, done: 0 } })
    for (let i = 0; i < files.length; i++) {
      const f = files[i] as FileWithPath
      try {
        const r = await callIngest(f)
        const id = r.doc_id
        const blobUrl = URL.createObjectURL(f)
        const path = f.webkitRelativePath || f.name // store folder path when available

        set(s => ({
          docs: {
            ...s.docs,
            [id]: {
              id,
              name: f.name,
              size: f.size,
              blobUrl,
              overview: r.overview,
              createdAt: Date.now(),
              path,
            }
          },
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
