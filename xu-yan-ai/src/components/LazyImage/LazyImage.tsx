import { memo, useMemo } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getCachedUrl, setCachedUrl } from '../../utils/imageCache'

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  onClick?: () => void
  timestamp?: number
  thumbnailSrc?: string
}

function convertToAssetUrl(path: string): string {
  if (!path || typeof path !== 'string') return ''
  
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  
  if (/^[A-Za-z]:[/\\]/.test(path) || /^\/[^/]/.test(path)) {
    const cached = getCachedUrl(path)
    if (cached) return cached
    
    try {
      const assetUrl = convertFileSrc(path)
      setCachedUrl(path, assetUrl)
      return assetUrl
    } catch {
      return path
    }
  }
  return path
}

const LazyImage = memo<LazyImageProps>(({ 
  src, 
  alt, 
  className, 
  onClick,
  timestamp,
  thumbnailSrc
}) => {
  const displayUrl = useMemo(() => {
    if (thumbnailSrc) {
      return convertToAssetUrl(thumbnailSrc)
    }
    return convertToAssetUrl(src)
  }, [src, thumbnailSrc])
  
  const fullUrl = useMemo(() => convertToAssetUrl(src), [src])
  
  const finalUrl = useMemo(() => {
    if (!displayUrl) return ''
    if (timestamp && !displayUrl.startsWith('data:')) {
      return `${displayUrl}${displayUrl.includes('?') ? '&' : '?'}t=${timestamp}`
    }
    return displayUrl
  }, [displayUrl, timestamp])

  if (!src || typeof src !== 'string') {
    return (
      <div 
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-tertiary)',
          fontSize: '12px',
        }}
      >
        无图片
      </div>
    )
  }

  if (!displayUrl) {
    return (
      <div 
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-tertiary)',
          fontSize: '12px',
        }}
      >
        加载失败
      </div>
    )
  }

  return (
    <img
      src={finalUrl}
      alt={alt}
      className={className}
      decoding="async"
      loading="eager"
      onClick={onClick}
      data-full-url={fullUrl !== displayUrl ? fullUrl : undefined}
      style={{
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        cursor: onClick ? 'pointer' : 'default',
      }}
    />
  )
})

LazyImage.displayName = 'LazyImage'

export default LazyImage
