import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { X, Upload, Trash2, ZoomIn, Image as ImageIcon, Loader2, Check, RefreshCw, AlertCircle, Maximize2, Minimize2 } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import LazyImage from '../LazyImage/LazyImage'
import styles from './CharacterLibrary.module.css'

interface CharacterImage {
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

interface CharacterCardProps {
  character: CharacterImage
  isSelected: boolean
  onSelect: (id: string) => void
  onPreview: (character: CharacterImage) => void
  onDelete: (id: string) => void
}

const CharacterCard = memo<CharacterCardProps>(({ character, isSelected, onSelect, onPreview, onDelete }) => {
  const handleCardClick = () => onSelect(character.id)
  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPreview(character)
  }
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(character.id)
  }

  return (
    <div 
      className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
      onClick={handleCardClick}
    >
      <div className={styles.imageWrapper}>
        <LazyImage src={character.preview} alt={character.name} />
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
        <span className={styles.cardName} title={character.name}>{character.name}</span>
      </div>
      {isSelected && <div className={styles.selectedBadge}><Check size={12} /></div>}
    </div>
  )
}, (prev, next) => {
  return prev.character.id === next.character.id && prev.isSelected === next.isSelected
})

CharacterCard.displayName = 'CharacterCard'

const CharacterLibrary: React.FC<{
  isOpen: boolean
  onClose: () => void
}> = ({ isOpen, onClose }) => {
  const { settings, activeTask } = useAppStore()
  const [characters, setCharacters] = useState<CharacterImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [previewImage, setPreviewImage] = useState<CharacterImage | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(180) // 图片格子大小 px
  const isMounted = useRef(true)
  const hasLoaded = useRef(false)

  const characterLibraryPath = useMemo(() => {
    return activeTask 
      ? `${activeTask.path}\\角色库` 
      : settings.savePath 
        ? `${settings.savePath}\\角色库` 
        : null
  }, [activeTask, settings.savePath])

  const loadCharacters = useCallback(async () => {
    if (!characterLibraryPath) {
      if (isMounted.current) setCharacters([])
      return
    }

    if (!isMounted.current) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const pathExists = await fs.exists(characterLibraryPath)
      
      if (!pathExists) {
        if (isMounted.current) setCharacters([])
        return
      }

      const entries = await fs.readDir(characterLibraryPath)
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
      
      const characterImages: CharacterImage[] = entries
        .filter(entry => 
          entry.isFile === true && entry.name && imageExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))
        )
        .map(entry => {
          const filePath = `${characterLibraryPath}\\${entry.name}`
          return {
            id: entry.name,
            name: entry.name,
            path: filePath,
            preview: getAssetUrl(filePath),
          }
        })

      if (isMounted.current) setCharacters(characterImages)
    } catch (err) {
      console.error('[CharacterLibrary] 加载失败:', err)
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : '加载失败')
        setCharacters([])
      }
    } finally {
      if (isMounted.current) setIsLoading(false)
    }
  }, [characterLibraryPath])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (hasLoaded.current) return
    hasLoaded.current = true
    loadCharacters()
  }, [loadCharacters])

  const handleImport = useCallback(async () => {
    if (!characterLibraryPath) {
      alert('请先设置任务保存路径')
      return
    }

    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
      
      if (!await fs.exists(characterLibraryPath)) {
        await fs.mkdir(characterLibraryPath, { recursive: true })
      }

      const files = await openDialog({
        multiple: true,
        filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
        title: '选择角色图片',
      })

      if (!files) return

      const fileArray = Array.isArray(files) ? files : [files]
      setIsImporting(true)
      setImportProgress({ current: 0, total: fileArray.length })

      for (let i = 0; i < fileArray.length; i++) {
        const filePath = fileArray[i] as string
        const fileName = filePath.split(/[/\\]/).pop() || `character_${Date.now()}.png`
        const destPath = `${characterLibraryPath}\\${fileName}`

        try {
          const fileData = await fs.readFile(filePath)
          await fs.writeFile(destPath, fileData)
        } catch (err) {
          console.error(`[CharacterLibrary] 导入失败: ${fileName}`, err)
        }

        setImportProgress({ current: i + 1, total: fileArray.length })
      }

      await loadCharacters()
    } catch (err) {
      console.error('[CharacterLibrary] 导入失败:', err)
      alert('导入失败: ' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setIsImporting(false)
      setImportProgress({ current: 0, total: 0 })
    }
  }, [characterLibraryPath, loadCharacters])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定删除?')) return

    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const character = characters.find(c => c.id === id)
      if (character) {
        await fs.remove(character.path)
        imageCache.delete(character.path)
        setCharacters(prev => prev.filter(c => c.id !== id))
        if (previewImage?.id === id) setPreviewImage(null)
      }
    } catch (err) {
      console.error('[CharacterLibrary] 删除失败:', err)
      alert('删除失败')
    }
  }, [characters, previewImage])

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个?`)) return

    try {
      const fs = await import('@tauri-apps/plugin-fs')
      for (const id of selectedIds) {
        const character = characters.find(c => c.id === id)
        if (character) {
          await fs.remove(character.path)
          imageCache.delete(character.path)
        }
      }
      setCharacters(prev => prev.filter(c => !selectedIds.has(c.id)))
      setSelectedIds(new Set())
      if (previewImage && selectedIds.has(previewImage.id)) setPreviewImage(null)
    } catch (err) {
      console.error('[CharacterLibrary] 批量删除失败:', err)
      alert('批量删除失败')
    }
  }, [selectedIds, characters, previewImage])

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
    setIsMaximized(false)
    setZoomLevel(180)
    onClose()
  }, [onClose])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isMaximized) return
    e.preventDefault()
    setZoomLevel(prev => {
      const delta = e.deltaY > 0 ? -20 : 20
      return Math.max(80, Math.min(400, prev + delta))
    })
  }, [isMaximized])

  const handlePreview = useCallback((character: CharacterImage) => {
    setPreviewImage(character)
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
      <div className={`${styles.modal} ${isMaximized ? styles.modalMaximized : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2><ImageIcon size={20} />角色库管理</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              className={styles.closeBtn}
              onClick={() => setIsMaximized(prev => !prev)}
              title={isMaximized ? '还原' : '最大化'}
            >
              {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button className={styles.closeBtn} onClick={handleClose}><X size={20} /></button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.pathInfo}>
            {characterLibraryPath ? (
              <span className={styles.pathText}>{characterLibraryPath}</span>
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
            <button className={styles.refreshBtn} onClick={loadCharacters} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? styles.spinning : ''} />
            </button>
            <button className={styles.importBtn} onClick={handleImport} disabled={!characterLibraryPath || isImporting}>
              {isImporting ? (
                <><Loader2 size={16} className={styles.spinning} />导入中 {importProgress.current}/{importProgress.total}</>
              ) : (
                <><Upload size={16} />导入图片</>
              )}
            </button>
          </div>
        </div>

        <div className={styles.content} onWheel={handleWheel}>
          {error ? (
            <div className={styles.error}>
              <AlertCircle size={32} />
              <p>{error}</p>
              <button onClick={loadCharacters}>重试</button>
            </div>
          ) : isLoading ? (
            <div className={styles.loading}>
              <Loader2 size={32} className={styles.spinning} />
              <p>加载中...</p>
            </div>
          ) : characters.length === 0 ? (
            <div className={styles.empty}>
              <ImageIcon size={48} strokeWidth={1} />
              <p>角色库为空</p>
              <p className={styles.emptyHint}>
                {characterLibraryPath ? '点击导入按钮添加图片' : '请先设置任务保存路径'}
              </p>
            </div>
          ) : (
            <div
              className={styles.grid}
              style={isMaximized ? { gridTemplateColumns: `repeat(auto-fill, minmax(${zoomLevel}px, 1fr))` } : undefined}
            >
              {characters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  isSelected={selectedIds.has(character.id)}
                  onSelect={toggleSelect}
                  onPreview={handlePreview}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.stats}>共 {characters.length} 个角色图片</span>
          {isMaximized && <span className={styles.stats}>滚轮缩放 {Math.round(zoomLevel)}px</span>}
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

export default CharacterLibrary
