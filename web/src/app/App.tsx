import React, { useCallback, useState } from 'react'
import { useStore } from '@/store/useStore'
import IntroStep from '@/components/steps/IntroStep'
import ReviewStep from '@/components/steps/ReviewStep'
import WorkspaceStep from '@/components/steps/WorkspaceStep'

type Step = 'intro' | 'review' | 'workspace'

export default function App() {
  const addFiles = useStore(s => s.addFiles)
  const [step, setStep] = useState<Step>('intro')
  const [picked, setPicked] = useState<File[]>([])

  const handleIntroDone = useCallback((files: File[]) => {
    const pdfs = files.filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )
    if (pdfs.length) {
      setPicked(pdfs)
      addFiles(pdfs)
      setStep('review')
    }
  }, [addFiles])

  return (
    <>
      {step === 'intro' && <IntroStep onReady={handleIntroDone} />}
      {step === 'review' && <ReviewStep files={picked} onContinue={() => setStep('workspace')} />}
      {step === 'workspace' && <WorkspaceStep />}
    </>
  )
}
