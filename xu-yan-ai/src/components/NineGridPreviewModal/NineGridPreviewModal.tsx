import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2, Move, ZoomIn } from 'lucide-react'
import { readDir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { convertFileSrc } from '@tauri-apps/api/core'
import LazyImage from '../LazyImage/LazyImage'
import styles from './NineGridPreviewModal.module.css'

interface NineGridPreviewModalProps {
  isOpen: boolean
  shotNumber: number | string
  taskPath: string | null
  onClose: () => void
}

interface NineGridImage {
  index: number
  path: string
  preview: string
  name: string
}

interface Position {
  x: number
  y: number
}

let currentDragData: { path: string; index: number; shotNumber: string | number } | null = null

const NineGridPreviewModal: React.FC<NineGridPreviewModalProps> = ({
  isOpen,
  shotNumber,
  taskPath,
  onClose,
}) => {
  const [images, setImages] = useState<NineGridImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState<NineGridImage | null>(null)
  const [position, setPosition] = useState<Position>({ x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 })
  const [dragStartPos, setDragStartPos] = useState<Position>({ x: 0, y: 0 })
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const modalRef = useRef<HTMLDivElement>(null)

  const loadNineGridImages = useCallback(async () => {
    if (!taskPath) return

    setIsLoading(true)
    try {
      const nineGridDir = await join(taskPath, '九宫格')
      const entries = await readDir(nineGridDir)

      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
      const prefix = `${shotNumber}+`

      const gridImages: NineGridImage[] = []

      for (let i = 1; i <= 9; i++) {
        const targetName = `${prefix}${i}九宫格切图`
        const entry = entries.find(e =>
          e.name &&
          imageExtensions.some(ext => e.name.toLowerCase().endsWith(ext)) &&
          (e.name === `${targetName}.png` || e.name === `${targetName}.jpg` || e.name === `${targetName}.jpeg`)
        )

        if (entry) {
          const filePath = `${nineGridDir}\\${entry.name}`
          gridImages.push({
            index: i,
            path: filePath,
            preview: convertFileSrc(filePath),
            name: entry.name || '',
          })
        }
      }

      gridImages.sort((a, b) => a.index - b.index)
      setImages(gridImages)
    } catch (error) {
      console.error('[NineGridPreviewModal] 加载九宫格图片失败:', error)
      setImages([])
    } finally {
      setIsLoading(false)
    }
  }, [taskPath, shotNumber])

  useEffect(() => {
    if (isOpen && taskPath) {
      loadNineGridImages()
    }
  }, [isOpen, taskPath, shotNumber, loadNineGridImages])

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(`.${styles.closeBtn}`)) {
      return
    }

    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setDragStartPos({ x: position.x, y: position.y })
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x
      const deltaY = e.clientY - dragStart.y

      let newX = dragStartPos.x + deltaX
      let newY = dragStartPos.y + deltaY

      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      const modalWidth = modalRef.current?.offsetWidth || 380
      const modalHeight = modalRef.current?.offsetHeight || 400

      newX = Math.max(0, Math.min(newX, windowWidth - modalWidth))
      newY = Math.max(0, Math.min(newY, windowHeight - modalHeight))

      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart, dragStartPos])

  const handleImageMouseDown = useCallback((e: React.MouseEvent, image: NineGridImage) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    setSelectedImage(image)
    currentDragData = { path: image.path, index: image.index, shotNumber }

    const startX = e.clientX
    const startY = e.clientY
    let hasStartedDrag = false

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (hasStartedDrag) return

      const deltaX = Math.abs(moveEvent.clientX - startX)
      const deltaY = Math.abs(moveEvent.clientY - startY)

      if (deltaX > 5 || deltaY > 5) {
        hasStartedDrag = true
        window.postMessage({
          type: 'NINEGRID_IMAGE_DRAG_START',
          payload: currentDragData
        }, '*')
      }
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      setSelectedImage(null)

      if (currentDragData) {
        window.postMessage({
          type: 'NINEGRID_IMAGE_DRAG_END',
          payload: {
            x: upEvent.clientX,
            y: upEvent.clientY,
            shotNumber: currentDragData.shotNumber,
            path: currentDragData.path,
            index: currentDragData.index,
          }
        }, '*')
      }

      currentDragData = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [shotNumber])

  const handleImageClick = useCallback((image: NineGridImage) => {
    setPreviewImage(image.preview)
  }, [])

  const closePreview = useCallback(() => {
    setPreviewImage(null)
  }, [])

  if (!isOpen) return null

  return (
    <>
      <div
        ref={modalRef}
        className={`${styles.floatingWindow} ${isDragging ? styles.dragging : ''}`}
        style={{
          left: position.x,
          top: position.y,
        }}
      >
        <div
          className={styles.header}
          onMouseDown={handleHeaderMouseDown}
        >
          <div className={styles.dragHandle}>
            <Move size={14} />
          </div>
          <h3 className={styles.title}>镜头 {shotNumber} 九宫格</h3>
          <p className={styles.hint}>按住拖动到首帧或尾帧</p>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>
              <Loader2 size={32} className={styles.spinner} />
              <p>加载中...</p>
            </div>
          ) : images.length === 0 ? (
            <div className={styles.empty}>
              <p>未找到九宫格切图</p>
              <span>请先在对应图生图镜头中执行九宫格切割</span>
            </div>
          ) : (
            <div className={styles.grid}>
              {images.map((image) => (
                <div
                  key={image.index}
                  className={`${styles.imageItem} ${selectedImage === image ? styles.dragging : ''}`}
                  onMouseDown={(e) => handleImageMouseDown(e, image)}
                  onClick={() => handleImageClick(image)}
                >
                  <div className={styles.imageWrapper}>
                    <LazyImage
                      src={image.preview}
                      alt={`九宫格 ${image.index}`}
                    />
                    <div className={styles.imageLabel}>{image.index}</div>
                    <button
                      className={styles.zoomBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleImageClick(image)
                      }}
                      title="放大查看"
                    >
                      <ZoomIn size={14} />
                    </button>
                  </div>
                  <div className={styles.dragHint}>按住拖动到首帧/尾帧</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {previewImage && (
        <div className={styles.previewOverlay} onClick={closePreview}>
          <div className={styles.previewContent} onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Preview" />
            <button className={styles.previewCloseBtn} onClick={closePreview}>
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default NineGridPreviewModal