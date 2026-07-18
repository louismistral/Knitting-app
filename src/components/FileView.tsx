import { useEffect, useState } from 'react'
import type { FileRef } from '../types'
import { getFile } from '../db'

/** Loads a stored blob and yields a temporary object URL, revoked on cleanup. */
export function useObjectUrl(ref: FileRef | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoked: string | null = null
    let active = true
    if (!ref) {
      setUrl(null)
      return
    }
    getFile(ref.id).then((blob) => {
      if (!active || !blob) return
      const u = URL.createObjectURL(blob)
      revoked = u
      setUrl(u)
    })
    return () => {
      active = false
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [ref?.id])
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
  const url = useObjectUrl(isImage ? file : null)
  if (isImage && url) {
    return <img className={className} src={url} alt={file?.name ?? ''} />
  }
  const icon = file?.type === 'application/pdf' ? '📄' : fallback
  return <div className={className}>{icon}</div>
}

/** Full pattern preview: inline image or embedded PDF. */
export function PatternPreview({ file }: { file: FileRef | null }) {
  const url = useObjectUrl(file)
  if (!file || !url) {
    return <div className="thumb lg">📄</div>
  }
  if (file.type.startsWith('image/')) {
    return <img className="thumb lg" style={{ objectFit: 'contain' }} src={url} alt={file.name} />
  }
  return <iframe className="pdf-viewer" src={url} title={file.name} />
}
