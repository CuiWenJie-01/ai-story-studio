import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { X, Upload, Trash2, ZoomIn, Image as ImageIcon, Loader2, Check, RefreshCw, AlertCircle } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import LazyImage from '../LazyImage/LazyImage'
import styles from './GenericLibrary.module.css'

export type LibraryKind = 'character' | 'prop' | 'scene'

interface LibraryConfig {
  kind: LibraryKind
  title: string
  folderName: string
}

interface LibraryImage {
  id: string
  name: string
  path: string
  preview: string
}

const imageCache = new Map<string, string>()

function getAssetUrl(filePath: string): string {
  const cached = imageCache.get(filePath)
  if (cached) return cached
  
  const url = convertFileSrc(filePath)
  imageCache.set(filePath, url)
  return url
}

interface ImageCardProps {
  image: LibraryImage
  isSelected: boolean
  onSelect: (id: string) => void
  onPreview: (image: LibraryImage) => void
  onDelete: (id: string) => void
}

const ImageCard = memo<ImageCardProps>(({ image, isSelected, onSelect, onPreview, onDelete }) => {
  const handleCardClick = () => onSelect(image.id)
  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPreview(image)
  }
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(image.id)
  }

  return (
    <div 
      className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
      onClick={handleCardClick}
    >
      <div className={styles.imageWrapper}>
        <LazyImage src={image.preview} alt={image.name} />
        <div className={styles.cardOverlay}>
          <button className={styles.previewBtn} onClick={handlePreview} type="button">
            <ZoomIn size={18} />
          </button>
          <button className={styles.deleteBtn} onClick={handleDelete} type="button">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <div className={styles.cardInfo}>
        <span className={styles.cardName} title={image.name}>{image.name}</span>
      </div>
      {isSelected && <div className={styles.selectedBadge}><Check size={12} /></div>}
    </div>
  )
}, (prev, next) => {
  return prev.image.id === next.image.id && prev.isSelected === next.isSelected
})

ImageCard.displayName = 'ImageCard'

interface GenericLibraryProps {
  isOpen: boolean
  onClose: () => void
  config: LibraryConfig
}

const GenericLibrary: React.FC<GenericLibraryProps> = ({ isOpen, onClose, config }) => {
  const { settings, activeTask } = useAppStore()
  const [images, setImages] = useState<LibraryImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [previewImage, setPreviewImage] = useState<LibraryImage | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const isMounted = useRef(true)
  const hasLoaded = useRef(false)

  const libraryPath = useMemo(() => {
    return activeTask 
      ? `${activeTask.path}\\${config.folderName}` 
      : settings.savePath 
        ? `${settings.savePath}\\${config.folderName}` 
        : null
  }, [activeTask, settings.savePath, config.folderName])

  const loadImages = useCallback(async () => {
    if (!libraryPath) {
      if (isMounted.current) setImages([])
      return
    }

    if (!isMounted.current) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const pathExists = await fs.exists(libraryPath)
      
      if (!pathExists) {
        if (isMounted.current) setImages([])
        return
      }

      const entries = await fs.readDir(libraryPath)
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
      
      const libraryImages: LibraryImage[] = entries
        .filter(entry => 
          entry.isFile === true && entry.name && imageExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))
        )
        .map(entry => {
          const filePath = `${libraryPath}\\${entry.name}`
          return {
            id: entry.name,
            name: entry.name,
            path: filePath,
            preview: getAssetUrl(filePath),
          }
        })

      if (isMounted.current) setImages(libraryImages)
    } catch (err) {
      console.error(`[${config.title}] 加载失败:`, err)
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : '加载失败')
        setImages([])
      }
    } finally {
      if (isMounted.current) setIsLoading(false)
    }
  }, [libraryPath, config.title])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (hasLoaded.current) return
    hasLoaded.current = true
    loadImages()
  }, [loadImages])

  useEffect(() => {
    if (isOpen) {
      hasLoaded.current = false
      loadImages()
    }
  }, [isOpen, loadImages])

  const handleImport = useCallback(async () => {
    if (!libraryPath) {
      alert('请先设置任务保存路径')
      return
    }

    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
      
      if (!await fs.exists(libraryPath)) {
        await fs.mkdir(libraryPath, { recursive: true })
      }

      const files = await openDialog({
        multiple: true,
        filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
        title: `选择${config.title}图片`,
      })

      if (!files) return

      const fileArray = Array.isArray(files) ? files : [files]
      setIsImporting(true)
      setImportProgress({ current: 0, total: fileArray.length })

      for (let i = 0; i < fileArray.length; i++) {
        const filePath = fileArray[i] as string
        const fileName = filePath.split(/[/\\]/).pop() || `image_${Date.now()}.png`
        const destPath = `${libraryPath}\\${fileName}`

        try {
          const fileData = await fs.readFile(filePath)
          await fs.writeFile(destPath, fileData)
        } catch (err) {
          console.error(`[${config.title}] 导入失败: ${fileName}`, err)
        }

        setImportProgress({ current: i + 1, total: fileArray.length })
      }

      await loadImages()
    } catch (err) {
      console.error(`[${config.title}] 导入失败:`, err)
      alert('导入失败: ' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setIsImporting(false)
      setImportProgress({ current: 0, total: 0 })
    }
  }, [libraryPath, loadImages, config.title])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定删除?')) return

    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const image = images.find(img => img.id === id)
      if (image) {
        await fs.remove(image.path)
        imageCache.delete(image.path)
        setImages(prev => prev.filter(img => img.id !== id))
        if (previewImage?.id === id) setPreviewImage(null)
      }
    } catch (err) {
      console.error(`[${config.title}] 删除失败:`, err)
      alert('删除失败')
    }
  }, [images, previewImage, config.title])

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个?`)) return

    try {
      const fs = await import('@tauri-apps/plugin-fs')
      for (const id of selectedIds) {
        const image = images.find(img => img.id === id)
        if (image) {
          await fs.remove(image.path)
          imageCache.delete(image.path)
        }
      }
      setImages(prev => prev.filter(img => !selectedIds.has(img.id)))
      setSelectedIds(new Set())
      if (previewImage && selectedIds.has(previewImage.id)) setPreviewImage(null)
    } catch (err) {
      console.error(`[${config.title}] 批量删除失败:`, err)
      alert('批量删除失败')
    }
  }, [selectedIds, images, previewImage, config.title])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }, [])

  const handleClose = useCallback(() => {
    setPreviewImage(null)
    setSelectedIds(new Set())
    setError(null)
    onClose()
  }, [onClose])

  const handlePreview = useCallback((image: LibraryImage) => {
    setPreviewImage(image)
  }, [])

  const closePreview = useCallback(() => {
    setPreviewImage(null)
  }, [])

  const selectedCount = selectedIds.size

  return (
    <div 
      className={styles.overlay} 
      onClick={handleClose}
      style={{ display: isOpen ? 'flex' : 'none' }}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2><ImageIcon size={20} />{config.title}管理</h2>
          <button className={styles.closeBtn} onClick={handleClose}><X size={20} /></button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.pathInfo}>
            {libraryPath ? (
              <span className={styles.pathText}>{libraryPath}</span>
            ) : (
              <span className={styles.pathWarning}>请先设置任务保存路径</span>
            )}
          </div>
          <div className={styles.toolbarActions}>
            {selectedCount > 0 && (
              <button className={styles.deleteSelectedBtn} onClick={handleDeleteSelected}>
                <Trash2 size={16} />删除选中 ({selectedCount})
              </button>
            )}
            <button className={styles.refreshBtn} onClick={loadImages} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? styles.spinning : ''} />
            </button>
            <button className={styles.importBtn} onClick={handleImport} disabled={!libraryPath || isImporting}>
              {isImporting ? (
                <><Loader2 size={16} className={styles.spinning} />导入中 {importProgress.current}/{importProgress.total}</>
              ) : (
                <><Upload size={16} />导入图片</>
              )}
            </button>
          </div>
        </div>

        <div className={styles.content}>
          {error ? (
            <div className={styles.error}>
              <AlertCircle size={32} />
              <p>{error}</p>
              <button onClick={loadImages}>重试</button>
            </div>
          ) : isLoading ? (
            <div className={styles.loading}>
              <Loader2 size={32} className={styles.spinning} />
              <p>加载中...</p>
            </div>
          ) : images.length === 0 ? (
            <div className={styles.empty}>
              <ImageIcon size={48} strokeWidth={1} />
              <p>{config.title}为空</p>
              <p className={styles.emptyHint}>
                {libraryPath ? '点击导入按钮添加图片' : '请先设置任务保存路径'}
              </p>
            </div>
          ) : (
            <div className={styles.grid}>
              {images.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  isSelected={selectedIds.has(image.id)}
                  onSelect={toggleSelect}
                  onPreview={handlePreview}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.stats}>共 {images.length} 个图片</span>
          {selectedCount > 0 && <span className={styles.selectedStats}>已选择 {selectedCount} 个</span>}
        </div>
      </div>

      {previewImage && (
        <div className={styles.previewOverlay} onClick={closePreview}>
          <div className={styles.previewModal} onClick={e => e.stopPropagation()}>
            <button className={styles.previewCloseBtn} onClick={closePreview}><X size={24} /></button>
            <img src={previewImage.preview} alt={previewImage.name} />
            <div className={styles.previewInfo}><span>{previewImage.name}</span></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GenericLibrary
