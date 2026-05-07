import React, { useRef, useState, useEffect, useCallback } from 'react'
import { X, RotateCcw, Save, Minus, Plus, Eraser, Paintbrush } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import styles from './ImageEditor.module.css'

interface ImageEditorProps {
  imagePath: string
  imageName: string
  onClose: () => void
  onSave: (newImagePath: string, newImageName: string) => void
}

const PRESET_COLORS = [
  '#ff0000',
  '#ff6600',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#0066ff',
  '#9900ff',
  '#ff00ff',
  '#ffffff',
  '#808080',
  '#000000',
]

const ImageEditor: React.FC<ImageEditorProps> = ({
  imagePath,
  imageName,
  onClose,
  onSave
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  
  const [isLoaded, setIsLoaded] = useState(false)
  const [brushSize, setBrushSize] = useState(1)
  const [isDrawing, setIsDrawing] = useState(false)
  const [history, setHistory] = useState<ImageData[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isSaving, setIsSaving] = useState(false)
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush')
  const [brushColor, setBrushColor] = useState('#ff0000')
  const [brushOpacity, setBrushOpacity] = useState(1)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  
  const [scale, setScale] = useState(1)
  const [baseDisplaySize, setBaseDisplaySize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageRef.current = img
      
      const maxWidth = window.innerWidth * 0.8
      const maxHeight = window.innerHeight * 0.6
      
      let displayWidth = img.width
      let displayHeight = img.height
      
      if (displayWidth > maxWidth) {
        displayHeight = (maxWidth / displayWidth) * displayHeight
        displayWidth = maxWidth
      }
      if (displayHeight > maxHeight) {
        displayWidth = (maxHeight / displayHeight) * displayWidth
        displayHeight = maxHeight
      }
      
      canvas.width = img.width
      canvas.height = img.height
      canvas.style.width = `${displayWidth}px`
      canvas.style.height = `${displayHeight}px`
      setBaseDisplaySize({ width: displayWidth, height: displayHeight })
      
      ctx.drawImage(img, 0, 0)
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setHistory([imageData])
      setHistoryIndex(0)
      setIsLoaded(true)
    }
    const src = imagePath.match(/^[A-Za-z]:[/\\]/) ? convertFileSrc(imagePath) : imagePath
    img.src = src
  }, [imagePath])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || baseDisplaySize.width === 0) return
    
    canvas.style.width = `${baseDisplaySize.width * scale}px`
    canvas.style.height = `${baseDisplaySize.height * scale}px`
  }, [scale, baseDisplaySize])

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return
    
    e.preventDefault()
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(prev => Math.min(Math.max(0.1, prev + delta), 5))
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handlePanMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1) return
    
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    
    isPanningRef.current = true
    setIsPanning(true)
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop
    }
  }, [])

  const handlePanMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return
    
    const container = containerRef.current
    if (!container) return
    
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    
    container.scrollLeft = panStartRef.current.scrollLeft - dx
    container.scrollTop = panStartRef.current.scrollTop - dy
  }, [])

  const handlePanMouseUp = useCallback(() => {
    isPanningRef.current = false
    setIsPanning(false)
  }, [])

  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }, [])

  const hexToRgba = useCallback((hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }, [])

  const drawLine = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.lineWidth = brushSize * 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = hexToRgba(brushColor, brushOpacity)
    }
    
    ctx.stroke()
  }, [brushSize, tool, brushColor, brushOpacity, hexToRgba])

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isLoaded) return

    const { x, y } = getCanvasCoords(e)
    
    if (lastPosRef.current) {
      drawLine(lastPosRef.current.x, lastPosRef.current.y, x, y)
    } else {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      ctx.beginPath()
      ctx.arc(x, y, brushSize, 0, Math.PI * 2)
      
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = hexToRgba(brushColor, brushOpacity)
      }
      
      ctx.fill()
    }
    
    lastPosRef.current = { x, y }
  }, [isDrawing, isLoaded, getCanvasCoords, drawLine, brushSize, tool, brushColor, brushOpacity, hexToRgba])

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isLoaded || e.button !== 0) return
    setIsDrawing(true)
    lastPosRef.current = null
    draw(e)
  }, [isLoaded, draw])

  const stopDrawing = useCallback(() => {
    if (!isDrawing || !isLoaded) return
    
    setIsDrawing(false)
    lastPosRef.current = null
    
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    
    setHistory(prev => [...prev.slice(0, historyIndex + 1), imageData])
    setHistoryIndex(prev => prev + 1)
  }, [isDrawing, isLoaded, historyIndex])

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0 || !isLoaded) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const newIndex = historyIndex - 1
    ctx.putImageData(history[newIndex], 0, 0)
    setHistoryIndex(newIndex)
  }, [historyIndex, history, isLoaded])

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1 || !isLoaded) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const newIndex = historyIndex + 1
    ctx.putImageData(history[newIndex], 0, 0)
    setHistoryIndex(newIndex)
  }, [historyIndex, history, isLoaded])

  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !imageRef.current) return

    setIsSaving(true)

    try {
      const dataUrl = canvas.toDataURL('image/png')
      const base64Data = dataUrl.split(',')[1]
      
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const originalPath = imagePath
      
      let dirPath: string
      let fileName: string
      
      if (originalPath.includes('\\') || originalPath.includes('/')) {
        const lastSepIndex = Math.max(originalPath.lastIndexOf('\\'), originalPath.lastIndexOf('/'))
        dirPath = originalPath.substring(0, lastSepIndex)
        fileName = originalPath.substring(lastSepIndex + 1)
      } else {
        dirPath = ''
        fileName = originalPath
      }

      const lastDotIndex = fileName.lastIndexOf('.')
      const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName
      const ext = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '.png'
      
      const newName = `${nameWithoutExt}_已修改${ext}`
      const newPath = dirPath ? `${dirPath}\\${newName}` : newName

      const { writeFile } = await import('@tauri-apps/plugin-fs')
      await writeFile(newPath, bytes)

      onSave(newPath, newName)
      onClose()
    } catch (error) {
      console.error('保存失败:', error)
    } finally {
      setIsSaving(false)
    }
  }, [imagePath, onSave, onClose])

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !imageRef.current) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imageRef.current, 0, 0)
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory(prev => [...prev.slice(0, historyIndex + 1), imageData])
    setHistoryIndex(prev => prev + 1)
  }, [historyIndex])

  const handleResetZoom = useCallback(() => {
    setScale(1)
    const container = containerRef.current
    if (container) {
      container.scrollLeft = 0
      container.scrollTop = 0
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault()
          if (e.shiftKey) {
            handleRedo()
          } else {
            handleUndo()
          }
        } else if (e.key === 's') {
          e.preventDefault()
          handleSave()
        } else if (e.key === '0') {
          e.preventDefault()
          handleResetZoom()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo, handleSave, handleResetZoom])

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false
        setIsPanning(false)
      }
    }
    
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>编辑素材 - {imageName}</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolGroup}>
            <button
              className={`${styles.toolBtn} ${tool === 'brush' ? styles.toolBtnActive : ''}`}
              onClick={() => setTool('brush')}
              title="画笔涂抹"
            >
              <Paintbrush size={18} />
              <span>涂抹</span>
            </button>
            <button
              className={`${styles.toolBtn} ${tool === 'eraser' ? styles.toolBtnActive : ''}`}
              onClick={() => setTool('eraser')}
              title="橡皮擦"
            >
              <Eraser size={18} />
              <span>橡皮擦</span>
            </button>
          </div>

          <div className={styles.divider} />

          {tool === 'brush' && (
            <>
              <div className={styles.toolGroup}>
                <span className={styles.toolLabel}>颜色:</span>
                <div className={styles.colorPickerWrapper}>
                  <button
                    className={styles.colorPreview}
                    style={{ backgroundColor: brushColor }}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    title="选择颜色"
                  />
                  {showColorPicker && (
                    <div className={styles.colorPicker}>
                      <div className={styles.colorGrid}>
                        {PRESET_COLORS.map(color => (
                          <button
                            key={color}
                            className={`${styles.colorOption} ${brushColor === color ? styles.colorOptionActive : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              setBrushColor(color)
                              setShowColorPicker(false)
                            }}
                          />
                        ))}
                      </div>
                      <div className={styles.customColorRow}>
                        <input
                          type="color"
                          value={brushColor}
                          onChange={(e) => {
                            setBrushColor(e.target.value)
                            setShowColorPicker(false)
                          }}
                          className={styles.customColorInput}
                        />
                        <span className={styles.customColorLabel}>自定义</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.toolGroup}>
                <span className={styles.toolLabel}>透明度:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={brushOpacity}
                  onChange={(e) => setBrushOpacity(parseFloat(e.target.value))}
                  className={styles.opacitySlider}
                />
                <span className={styles.opacityValue}>{Math.round(brushOpacity * 100)}%</span>
              </div>

              <div className={styles.divider} />
            </>
          )}

          <div className={styles.toolGroup}>
            <span className={styles.toolLabel}>画笔大小:</span>
            <button
              className={styles.sizeBtn}
              onClick={() => setBrushSize(Math.max(1, brushSize - 5))}
              disabled={brushSize <= 1}
            >
              <Minus size={14} />
            </button>
            <span className={styles.sizeValue}>{brushSize}</span>
            <button
              className={styles.sizeBtn}
              onClick={() => setBrushSize(Math.min(100, brushSize + 5))}
              disabled={brushSize >= 100}
            >
              <Plus size={14} />
            </button>
          </div>

          <div className={styles.divider} />

          <div className={styles.toolGroup}>
            <span className={styles.toolLabel}>缩放:</span>
            <button
              className={styles.sizeBtn}
              onClick={() => setScale(Math.max(0.1, scale - 0.1))}
              disabled={scale <= 0.1}
            >
              <Minus size={14} />
            </button>
            <span className={styles.sizeValue}>{Math.round(scale * 100)}%</span>
            <button
              className={styles.sizeBtn}
              onClick={() => setScale(Math.min(5, scale + 0.1))}
              disabled={scale >= 5}
            >
              <Plus size={14} />
            </button>
            <button
              className={styles.resetZoomBtn}
              onClick={handleResetZoom}
              title="重置缩放 (Ctrl+0)"
            >
              重置
            </button>
          </div>

          <div className={styles.divider} />

          <div className={styles.toolGroup}>
            <button
              className={styles.actionBtn}
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              title="撤销 (Ctrl+Z)"
            >
              <RotateCcw size={16} />
              撤销
            </button>
            <button
              className={styles.actionBtn}
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              title="重做 (Ctrl+Shift+Z)"
            >
              <RotateCcw size={16} style={{ transform: 'scaleX(-1)' }} />
              重做
            </button>
            <button
              className={styles.actionBtn}
              onClick={handleClear}
              title="清除所有涂抹"
            >
              <X size={16} />
              清除
            </button>
          </div>

          <div className={styles.spacer} />

          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isSaving || !isLoaded}
          >
            {isSaving ? (
              <>
                <span className={styles.spinner} />
                保存中...
              </>
            ) : (
              <>
                <Save size={16} />
                保存
              </>
            )}
          </button>
        </div>

        <div 
          className={styles.canvasContainer} 
          ref={containerRef}
          onMouseDown={handlePanMouseDown}
          onMouseMove={handlePanMouseMove}
          onMouseUp={handlePanMouseUp}
          onMouseLeave={handlePanMouseUp}
          style={{ cursor: isPanning ? 'grabbing' : 'default' }}
        >
          {!isLoaded && (
            <div className={styles.loading}>加载中...</div>
          )}
          <div className={styles.canvasWrapper}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              style={{ cursor: isPanning ? 'grabbing' : 'crosshair', pointerEvents: isPanning ? 'none' : 'auto' }}
            />
          </div>
        </div>

        <div className={styles.hint}>
          提示: 按住 Ctrl + 滚轮缩放图片 | 按住鼠标中键拖动视图 | 使用画笔涂抹需要遮罩的区域
        </div>
      </div>
    </div>
  )
}

export default ImageEditor
