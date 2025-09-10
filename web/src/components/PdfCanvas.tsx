import React, { useEffect, useRef } from 'react'
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/build/pdf'
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export function PdfCanvas({ blobUrl }: { blobUrl?: string | null }){
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function render(){
      if (!host.current) return
      host.current.innerHTML = ''
      if (!blobUrl) {
        const msg = document.createElement('div')
        msg.style.color = '#9aa3b2'
        msg.style.padding = '12px'
        msg.textContent = 'Drop a PDF to preview it.'
        host.current.appendChild(msg)
        return
      }
      try {
        const pdf = await pdfjsLib.getDocument({ url: blobUrl }).promise
        if (cancelled) return
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1.2 })
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height
        host.current.appendChild(canvas)
        await page.render({ canvasContext: ctx, viewport }).promise
      } catch {
        if (host.current) {
          const msg = document.createElement('div')
          msg.style.color = '#ff6b6b'
          msg.style.padding = '12px'
          msg.textContent = 'Failed to render PDF preview.'
          host.current.appendChild(msg)
        }
      }
    }
    render()
    return () => { cancelled = true }
  }, [blobUrl])

  return <div className="pdf-canvas"><div className="canvas-host" ref={host} /></div>
}
