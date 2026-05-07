import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { Upload, X, GripVertical, ImageIcon, Users, Package, Mountain, FileImage, Loader2 } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import LazyImage from '../LazyImage/LazyImage'
import type { ReferenceImage } from '../../types'
import styles from './ReferenceImages.module.css'

interface LibraryImage {
  id: string
  name: string
  path: string
  preview: string
}

type LibraryType = 'character' | 'prop' | 'scene' | 'local'

interface ReferenceImagesProps {
  images: ReferenceImage[]
  onAddImage: (image: ReferenceImage) => void
  onRemoveImage: (id: string) => void
  onReorderImages: (images: ReferenceImage[]) => void
  maxImages?: number
}

const imageCache = new Map<string, string>()

const libraryCache = new Map<string, { images: LibraryImage[], timestamp: number }>()
const CACHE_DURATION = 30 * 1000

function getAssetUrl(filePath: string): string {
  const cached = imageCache.get(filePath)
  if (cached) return cached
  
  const url = convertFileSrc(filePath)
  imageCache.set(filePath, url)
  return url
}

function getLibraryCacheKey(libraryPath: string): string {
  return libraryPath
}

function getLibraryFromCache(libraryPath: string): LibraryImage[] | null {
  const cached = libraryCache.get(getLibraryCacheKey(libraryPath))
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    libraryCache.delete(getLibraryCacheKey(libraryPath))
    return null
  }
  return cached.images
}

function setLibraryCache(libraryPath: string, images: LibraryImage[]) {
  libraryCache.set(getLibraryCacheKey(libraryPath), {
    images,
    timestamp: Date.now()
  })
}

const ReferenceImages: React.FC<ReferenceImagesProps> = ({
  images,
  onAddImage,
  onRemoveImage,
  onReorderImages,
  maxImages = 6,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [activeLibrary, setActiveLibrary] = useState<LibraryType | null>(null)
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)
  
  const { settings, activeTask } = useAppStore()
  
  const basePath = useMemo(() => {
    return activeTask?.path || settings.savePath || null
  }, [activeTask, settings.savePath])
  
  const libraryPaths = useMemo(() => ({
    character: basePath ? `${basePath}\\角色库` : null,
    prop: basePath ? `${basePath}\\道具库` : null,
    scene: basePath ? `${basePath}\\场景库` : null,
  }), [basePath])

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/') && images.length < maxImages) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const newImage: ReferenceImage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            preview: e.target?.result as string,
            name: file.name,
            order: images.length,
          }
          onAddImage(newImage)
        }
        reader.readAsDataURL(file)
      }
    })
    setShowMenu(false)
  }, [images.length, maxImages, onAddImage])

  const handleUploadClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuPosition({ 
      x: rect.left + rect.width / 2, 
      y: rect.top 
    })
    setShowMenu(true)
  }, [])

  const handleMenuOption = useCallback((type: LibraryType) => {
    if (type === 'local') {
      fileInputRef.current?.click()
      setShowMenu(false)
    } else {
      setActiveLibrary(type)
      setShowMenu(false)
    }
  }, [])

  const loadLibraryImages = useCallback(async (type: 'character' | 'prop' | 'scene') => {
    const libraryPath = libraryPaths[type]
    if (!libraryPath) {
      setLibraryImages([])
      return
    }

    const cachedImages = getLibraryFromCache(libraryPath)
    if (cachedImages) {
      setLibraryImages(cachedImages)
      return
    }

    setIsLoadingLibrary(true)
    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const pathExists = await fs.exists(libraryPath)
      
      if (!pathExists) {
        setLibraryImages([])
        return
      }

      const entries = await fs.readDir(libraryPath)
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
      
      const images: LibraryImage[] = entries
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

      setLibraryCache(libraryPath, images)
      setLibraryImages(images)
    } catch (err) {
      console.error(`[ReferenceImages] 加载${type}库失败:`, err)
      setLibraryImages([])
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [libraryPaths])

  useEffect(() => {
    if (activeLibrary && activeLibrary !== 'local') {
      loadLibraryImages(activeLibrary)
    }
  }, [activeLibrary, loadLibraryImages])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleSelectLibraryImage = useCallback((image: LibraryImage) => {
    if (images.length >= maxImages) return
    
    const newImage: ReferenceImage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: null,
      preview: image.preview,
      path: image.path,
      name: image.name,
      order: images.length,
    }
    onAddImage(newImage)
  }, [images.length, maxImages, onAddImage])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleDragStart = (index: number) => {
    dragItem.current = index
  }

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index
  }

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null) {
      const items = [...images]
      const draggedItem = items[dragItem.current]
      items.splice(dragItem.current, 1)
      items.splice(dragOverItem.current, 0, draggedItem)
      
      const reorderedItems = items.map((img, idx) => ({ ...img, order: idx }))
      onReorderImages(reorderedItems)
    }
    dragItem.current = null
    dragOverItem.current = null
  }

  const remainingSlots = maxImages - images.length

  const getLibraryName = (type: LibraryType) => {
    switch (type) {
      case 'character': return '角色库'
      case 'prop': return '道具库'
      case 'scene': return '场景库'
      default: return ''
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>
          <ImageIcon size={18} />
          参考图片
        </h3>
        <span className={styles.count}>
          {images.length} / {maxImages}
        </span>
      </div>

      <div className={styles.grid}>
        {images.map((image, index) => (
          <div
            key={image.id}
            className={styles.imageItem}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className={styles.dragHandle}>
              <GripVertical size={14} />
            </div>
            {image.preview ? (
              <img src={image.preview} alt={image.name} className={styles.preview} />
            ) : (
              <div className={styles.nameTag}>
                <span>{image.name}</span>
              </div>
            )}
            <button
              className={styles.removeBtn}
              onClick={() => onRemoveImage(image.id)}
              title="移除图片"
            >
              <X size={14} />
            </button>
            <div className={styles.imageOrder}>{index + 1}</div>
          </div>
        ))}

        {remainingSlots > 0 && (
          <div
            className={styles.uploadSlot}
            onClick={handleUploadClick}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              e.currentTarget.classList.add(styles.dragOver)
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove(styles.dragOver)}
          >
            <Upload size={24} />
            <span>点击添加图片</span>
            <span className={styles.slotHint}>支持 JPG、PNG、WebP</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFileSelect(e.target.files)}
        className={styles.hiddenInput}
      />

      {images.length > 0 && (
        <p className={styles.hint}>拖拽图片可调整顺序</p>
      )}

      {showMenu && (
        <div 
          ref={menuRef}
          className={styles.menuOverlay}
          style={{ 
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
          }}
          onClick={() => setShowMenu(false)}
        >
          <div 
            className={styles.menuPopup}
            style={{
              position: 'fixed',
              left: menuPosition.x,
              top: menuPosition.y,
              transform: 'translate(-50%, -100%)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.menuGrid}>
              <div 
                className={styles.menuItem}
                onClick={() => handleMenuOption('character')}
              >
                <div className={styles.menuIcon}>
                  <Users size={24} />
                </div>
                <span>角色库</span>
              </div>
              <div 
                className={styles.menuItem}
                onClick={() => handleMenuOption('prop')}
              >
                <div className={styles.menuIcon}>
                  <Package size={24} />
                </div>
                <span>道具库</span>
              </div>
              <div 
                className={styles.menuItem}
                onClick={() => handleMenuOption('scene')}
              >
                <div className={styles.menuIcon}>
                  <Mountain size={24} />
                </div>
                <span>场景库</span>
              </div>
              <div 
                className={styles.menuItem}
                onClick={() => handleMenuOption('local')}
              >
                <div className={styles.menuIcon}>
                  <FileImage size={24} />
                </div>
                <span>本地文件</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeLibrary && (
        <div className={styles.libraryOverlay} onClick={() => setActiveLibrary(null)}>
          <div className={styles.libraryModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.libraryHeader}>
              <h3>{getLibraryName(activeLibrary)}</h3>
              <button className={styles.libraryCloseBtn} onClick={() => setActiveLibrary(null)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.libraryContent}>
              {isLoadingLibrary ? (
                <div className={styles.libraryLoading}>
                  <Loader2 size={32} className={styles.spinning} />
                  <p>加载中...</p>
                </div>
              ) : (activeLibrary !== 'local' && !libraryPaths[activeLibrary]) ? (
                <div className={styles.libraryEmpty}>
                  <p>请先设置任务保存路径</p>
                </div>
              ) : libraryImages.length === 0 ? (
                <div className={styles.libraryEmpty}>
                  <ImageIcon size={48} strokeWidth={1} />
                  <p>{getLibraryName(activeLibrary)}为空</p>
                  <span>请先在素材库中添加图片</span>
                </div>
              ) : (
                <div className={styles.libraryGrid}>
                  {libraryImages.map((image) => (
                    <div
                      key={image.id}
                      className={styles.libraryImageItem}
                      onClick={() => handleSelectLibraryImage(image)}
                    >
                      <LazyImage src={image.preview} alt={image.name} />
                      <div className={styles.libraryImageName}>{image.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReferenceImages
