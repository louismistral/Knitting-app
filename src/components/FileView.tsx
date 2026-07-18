import { useEffect, useState } from 'react'
import type { FileRef } from '../types'
import { signedUrl } from '../files'

/** Resolves a stored file to a temporary signed URL. */
export function useFileUrl(ref: FileRef | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (!ref) {
      setUrl(null)
      return
    }
    signedUrl(ref).then((u) => {
      if (active) setUrl(u)
    })
    return () => {
      active = false
    }
  }, [ref?.bucket, ref?.path])
  return url
}

interface ThumbProps {
  file: FileRef | null | undefined
  fallback?: string
  className?: string
}

/** Square thumbnail for an image; shows an icon for PDFs / empty. */
export function Thumb({ file, fallback = '🧶', className = 'thumb' }: ThumbProps) {
  const isImage = file?.type?.startsWith('image/')
  const url = useFileUrl(isImage ? file : null)
  if (isImage && url) {
    return <img className={className} src={url} alt={file?.name ?? ''} />
  }
  const icon = file?.type === 'application/pdf' ? '📄' : fallback
  return <div className={className}>{icon}</div>
}

/** Full pattern preview: inline image or embedded PDF. */
export function PatternPreview({ file }: { file: FileRef | null }) {
  const url = useFileUrl(file)
  if (!file || !url) {
    return <div className="thumb lg">📄</div>
  }
  if (file.type.startsWith('image/')) {
    return <img className="thumb lg" style={{ objectFit: 'contain' }} src={url} alt={file.name} />
  }
  return <iframe className="pdf-viewer" src={url} title={file.name} />
}
