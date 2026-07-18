import { supabase } from './supabase'
import type { Bucket, FileRef } from './types'

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Upload a file to a bucket under the current user's folder; returns a ref. */
export async function uploadFile(bucket: Bucket, file: File): Promise<FileRef> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('Not authenticated')

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${uid()}-${safeName}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error
  return { bucket, path, name: file.name, type: file.type }
}

/** Remove a stored file (best-effort). */
export async function removeFile(ref: FileRef | null | undefined): Promise<void> {
  if (!ref) return
  await supabase.storage.from(ref.bucket).remove([ref.path])
}

const urlCache = new Map<string, { url: string; expires: number }>()

/** Get a temporary signed URL for a stored file, cached until near expiry. */
export async function signedUrl(ref: FileRef | null | undefined): Promise<string | null> {
  if (!ref) return null
  const cacheKey = `${ref.bucket}/${ref.path}`
  const cached = urlCache.get(cacheKey)
  if (cached && cached.expires > Date.now() + 30_000) return cached.url

  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 3600)
  if (error || !data) return null
  urlCache.set(cacheKey, { url: data.signedUrl, expires: Date.now() + 3600 * 1000 })
  return data.signedUrl
}
