// src/components/PdfView.tsx
import React from 'react'
import './PdfView.css'

export default function PdfView({ blobUrl }: { blobUrl?: string | null }) {
  if (!blobUrl) {
    return (
      <div className="pdf-empty">
        <div className="card card--ghost">Drop or select a PDF</div>
      </div>
    )
  }
  // Hint the built-in viewer to fit the page width/height
  const src = `${blobUrl}#page=1&zoom=page-fit`  // try 'page-width' if you prefer
  return <iframe className="pdf-frame" src={src} title="PDF" />
}
