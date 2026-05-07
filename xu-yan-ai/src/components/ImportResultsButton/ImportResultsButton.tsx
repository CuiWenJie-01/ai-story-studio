import { useState, useCallback } from 'react'
import { Loader2, FolderSearch, Download } from 'lucide-react'
import { scanImageDirectory } from '../../utils/imageScanner'
import { scanVideoDirectory } from '../../utils/videoScanner'
import { batchGenerateThumbnails } from '../../utils/thumbnailManager'
import { useAppStore } from '../../store/appStore'
import styles from './ImportResultsButton.module.css'

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

const ImportResultsButton: React.FC = () => {
  const { activeTask, setGeneratedImageForShot, workItems, batchUpdateWorkItems } = useAppStore()
  const [importing, setImporting] = useState(false)
  const [matching, setMatching] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState<string | null>(null)

  // 一键导入生成结果（图片 + 视频）
  const handleImport = useCallback(async () => {
    if (!activeTask?.path) {
      setResult('请先选择任务')
      return
    }

    setImporting(true)
    setResult(null)
    setProgress({ current: 0, total: 0 })

    try {
      // 扫描图片
      const shotImages = await scanImageDirectory(activeTask.path)
      setProgress({ current: 0, total: shotImages.length })

      if (shotImages.length > 0) {
        const imagePaths = shotImages.map(img => img.path)
        const thumbnailMap = await batchGenerateThumbnails(
          imagePaths,
          (current: number, total: number) => {
            setProgress({ current, total })
          }
        )
        for (const shotImage of shotImages) {
          const thumbnailPath = thumbnailMap.get(shotImage.path)
          setGeneratedImageForShot(shotImage.shotNumber, shotImage.path, shotImage.fileName, thumbnailPath)
        }
      }

      // 扫描视频
      const shotVideos = await scanVideoDirectory(activeTask.path)
      let videoCount = 0

      if (shotVideos.length > 0) {
        const videoWorkItems = workItems.filter(item => item.type === 'video')
        const updates: Array<{ id: string; updates: Record<string, unknown> }> = []

        for (const video of shotVideos) {
          const videoItem = videoWorkItems.find(
            item => String(item.shotNumber) === String(video.shotNumber)
          )
          if (videoItem && !videoItem.generatedVideo) {
            updates.push({
              id: videoItem.id,
              updates: {
                generatedVideo: {
                  id: `imported-${Date.now()}-${video.shotNumber}`,
                  url: video.path,
                  timestamp: video.timestamp || Date.now(),
                  prompt: videoItem.prompt,
                  firstFrame: videoItem.firstFrame?.preview || '',
                  lastFrame: '',
                  duration: videoItem.duration || 5,
                },
                generationState: { status: 'completed', progress: 100, message: '已导入' },
              },
            })
            videoCount++
          }
        }

        if (updates.length > 0) {
          batchUpdateWorkItems(updates)
        }
      }

      const parts: string[] = []
      if (shotImages.length > 0) parts.push(`${shotImages.length} 张图片`)
      if (videoCount > 0) parts.push(`${videoCount} 个视频`)
      setResult(parts.length > 0 ? `已导入 ${parts.join('、')}` : '未找到可导入的结果')
    } catch (error) {
      console.error('[ImportResults] 导入失败:', error)
      setResult('导入失败')
    } finally {
      setImporting(false)
    }
  }, [activeTask, setGeneratedImageForShot, workItems, batchUpdateWorkItems])

  // 一键匹配参考图
  const handleMatchReferenceImages = useCallback(async () => {
    if (!activeTask?.path) {
      setResult('请先选择任务')
      return
    }

    setMatching(true)
    setResult(null)

    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
      const selectedFolder = await openDialog({
        directory: true,
        title: '选择参考图文件夹',
      })

      if (!selectedFolder || typeof selectedFolder !== 'string') {
        setMatching(false)
        return
      }

      const fs = await import('@tauri-apps/plugin-fs')
      const entries = await fs.readDir(selectedFolder)
      const imageFiles: { name: string; baseName: string; path: string }[] = []

      for (const entry of entries) {
        if (entry.isFile && entry.name) {
          const lower = entry.name.toLowerCase()
          if (IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))) {
            const baseName = entry.name.replace(/\.[^.]+$/, '')
            imageFiles.push({
              name: entry.name,
              baseName,
              path: `${selectedFolder}\\${entry.name}`,
            })
          }
        }
      }

      if (imageFiles.length === 0) {
        setResult('文件夹中未找到图片')
        setMatching(false)
        return
      }

      const imageWorkItems = workItems.filter(item => item.type === 'image')
      const updates: Array<{ id: string; updates: Record<string, unknown> }> = []
      let totalMatched = 0

      for (const item of imageWorkItems) {
        const characters = item.excelData?.characters || []
        if (characters.length === 0) continue

        let hasChange = false
        const newRefImages = [...item.referenceImages]

        for (let slotIdx = 0; slotIdx < characters.length; slotIdx++) {
          const charName = characters[slotIdx]
          if (!charName) continue

          const existingRef = newRefImages.find(img => img.slotIndex === slotIdx)
          if (existingRef) continue

          let matched = imageFiles.find(f => f.baseName === charName)
          if (!matched) {
            matched = imageFiles.find(f => f.baseName.includes(charName) || charName.includes(f.baseName))
          }

          if (matched) {
            newRefImages.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              file: null,
              preview: matched.path,
              path: matched.path,
              name: matched.name,
              order: slotIdx,
              slotIndex: slotIdx,
              characterName: charName,
            })
            hasChange = true
            totalMatched++
          }
        }

        if (hasChange) {
          updates.push({
            id: item.id,
            updates: { referenceImages: newRefImages },
          })
        }
      }

      if (updates.length > 0) {
        batchUpdateWorkItems(updates)
        setResult(`已匹配 ${totalMatched} 张参考图到 ${updates.length} 个镜头`)
      } else {
        setResult('未匹配到任何参考图（请检查文件名是否与角色名一致）')
      }
    } catch (error) {
      console.error('[MatchRef] 匹配失败:', error)
      setResult('匹配失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setMatching(false)
    }
  }, [activeTask, workItems, batchUpdateWorkItems])

  return (
    <div className={styles.container}>
      <button
        className={styles.button}
        onClick={handleImport}
        disabled={importing || matching || !activeTask}
      >
        {importing ? (
          <>
            <Loader2 size={14} className={styles.spinning} />
            <span>导入中... ({progress.current}/{progress.total})</span>
          </>
        ) : (
          <>
            <Download size={14} className={styles.buttonIcon} />
            <span>一键导入生成结果</span>
          </>
        )}
      </button>
      <button
        className={styles.button}
        onClick={handleMatchReferenceImages}
        disabled={importing || matching || !activeTask}
      >
        {matching ? (
          <>
            <Loader2 size={14} className={styles.spinning} />
            <span>匹配中...</span>
          </>
        ) : (
          <>
            <FolderSearch size={14} className={styles.buttonIcon} />
            <span>一键匹配参考图</span>
          </>
        )}
      </button>
      {result && !importing && !matching && (
        <div className={styles.result}>
          <span>{result}</span>
        </div>
      )}
    </div>
  )
}

export default ImportResultsButton
