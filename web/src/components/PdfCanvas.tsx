import React, { useEffect, useRef } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
// If your installed version doesn’t have the `.min` file, switch to 'pdf.worker.mjs?url'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc

export function PdfCanvas({ blobUrl }: { blobUrl?: string | null }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: import('pdfjs-dist/types/src/display/api').RenderTask | null = null
    let loadingTask: import('pdfjs-dist/types/src/display/api').PDFLoadingTask | null = null

    async function render() {
      const el = host.current
      if (!el) return

      // reset host
      el.innerHTML = ''

      if (!blobUrl) {
        const msg = document.createElement('div')
        msg.style.color = '#9aa3b2'
        msg.style.padding = '12px'
        msg.textContent = 'Drop a PDF to preview it.'
        el.appendChild(msg)
        return
      }

      try {
        // Start loading (keep a handle so we can destroy on cleanup)
        loadingTask = getDocument({ url: blobUrl })
        const pdf = await loadingTask.promise
        if (cancelled) return

        // First page
        const page = await pdf.getPage(1)
        if (cancelled) return

        // Fit to container width (nice UX)
        const containerWidth = el.clientWidth || 800
        const viewportBase = page.getViewport({ scale: 1 })
        const scale = Math.min(1.5, Math.max(0.5, containerWidth / viewportBase.width))
        const viewport = page.getViewport({ scale })

        // Canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas 2D context not available')

        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        canvas.style.width = `${Math.ceil(viewport.width)}px`
        canvas.style.height = `${Math.ceil(viewport.height)}px`
        el.appendChild(canvas)

        // Render
        renderTask = page.render({ canvasContext: ctx, viewport })
        await renderTask.promise
      } catch (err) {
        if (cancelled) return
        const msg = document.createElement('div')
        msg.style.color = '#ff6b6b'
        msg.style.padding = '12px'
        msg.textContent = 'Failed to render PDF preview.'
        host.current?.appendChild(msg)
        // Optional: console for details
        console.error('[PdfCanvas] render error:', err)
      }
    }

    render()

    // Cleanup: cancel render + destroy loading task to free worker/resources
    return () => {
      cancelled = true
      try {
        renderTask?.cancel()
      } catch {}
      try {
        loadingTask?.destroy()
      } catch {}
    }
  }, [blobUrl])

  return (
    <div className="pdf-canvas">
      <div className="canvas-host" ref={host} />
    </div>
  )
}
