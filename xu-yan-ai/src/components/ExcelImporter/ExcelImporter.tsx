import { useCallback, useRef, useState } from 'react'
import { FileSpreadsheet, Upload, X, Check, AlertCircle, Users, Loader2, Image } from 'lucide-react'
import { parseExcelFile } from '../../utils/excelParser'
import { scanCharacterLibrary, matchCharactersForShot, getMatchLogs } from '../../utils/characterMatcher'
import { scanImageDirectory } from '../../utils/imageScanner'
import { batchGenerateThumbnails } from '../../utils/thumbnailManager'
import { useAppStore } from '../../store/appStore'
import { taskQueueManager } from '../../services/taskQueueManager'
import type { ExcelImportResult, CharacterMatchResult } from '../../types'
import styles from './ExcelImporter.module.css'

const ExcelImporter: React.FC = () => {
  const { importFromExcel, activeTask, batchUpdateWorkItems, setGeneratedImageForShot } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ExcelImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [matchResults, setMatchResults] = useState<CharacterMatchResult[] | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [matching, setMatching] = useState(false)
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 })
  const [scanningImages, setScanningImages] = useState(false)
  const [scannedImageCount, setScannedImageCount] = useState(0)
  const [thumbnailProgress, setThumbnailProgress] = useState({ current: 0, total: 0 })
  const matchingRef = useRef(false)

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('请选择Excel文件 (.xlsx 或 .xls)')
      return
    }

    setImporting(true)
    setError(null)
    setResult(null)
    setMatchResults(null)
    setScannedImageCount(0)
    setThumbnailProgress({ current: 0, total: 0 })
    matchingRef.current = false

    try {
      const allTasks = taskQueueManager.getAllTasks()
      const processingTasks = allTasks.filter(t => t.status === 'processing' || t.status === 'pending')
      if (processingTasks.length > 0) {
        console.log(`[ExcelImporter] 取消 ${processingTasks.length} 个正在执行的任务`)
        for (const task of processingTasks) {
          taskQueueManager.removeTask(task.id)
        }
      }

      const importResult = await parseExcelFile(file)
      setResult(importResult)
      importFromExcel(importResult)
      setImporting(false)

      if (activeTask?.path) {
        console.log(`[ExcelImporter] 当前任务路径: ${activeTask.path}`)
        setScanningImages(true)
        
        setTimeout(async () => {
          try {
            console.log(`[ExcelImporter] 开始扫描Image目录...`)
            const shotImages = await scanImageDirectory(activeTask.path)
            console.log(`[ExcelImporter] 扫描结果: ${shotImages.length} 张图片`)
            
            if (shotImages.length > 0) {
              setScannedImageCount(shotImages.length)
              
              const imagePaths = shotImages.map(img => img.path)
              setThumbnailProgress({ current: 0, total: imagePaths.length })
              
              console.log(`[ExcelImporter] 开始批量生成缩略图...`)
              const thumbnailMap = await batchGenerateThumbnails(
                imagePaths,
                (current: number, total: number) => {
                  setThumbnailProgress({ current, total })
                }
              )
              console.log(`[ExcelImporter] 缩略图生成完成`)
              
              for (const shotImage of shotImages) {
                const thumbnailPath = thumbnailMap.get(shotImage.path)
                console.log(`[ExcelImporter] 设置镜头 ${shotImage.shotNumber} 的生成结果`)
                setGeneratedImageForShot(shotImage.shotNumber, shotImage.path, shotImage.fileName, thumbnailPath)
              }
            }
            
            setScanningImages(false)
          } catch (scanError) {
            console.error('[ImageScan] 扫描Image目录失败:', scanError)
            setScanningImages(false)
          }
        }, 50)

        const shotData = importResult.data.map(row => ({
          shotNumber: row.shotNumber,
          characters: row.characters || [],
        }))

        setMatching(true)
        matchingRef.current = true
        setMatchProgress({ current: 0, total: shotData.length })

        setTimeout(async () => {
          try {
            const characterImages = await scanCharacterLibrary(activeTask.path)
            const results: CharacterMatchResult[] = []
            const batchUpdates: Array<{ id: string; updates: Partial<import('../../types').WorkItem> }> = []

            const processNextShot = async (index: number) => {
              if (!matchingRef.current || index >= shotData.length) {
                setMatching(false)
                matchingRef.current = false
                setMatchResults(results)
                
                if (batchUpdates.length > 0) {
                  batchUpdateWorkItems(batchUpdates)
                }
                return
              }

              const { shotNumber, characters } = shotData[index]
              const matchResult = matchCharactersForShot(shotNumber, characters, characterImages)
              results.push(matchResult)

              setMatchProgress({ current: index + 1, total: shotData.length })

              if (matchResult.matchedImages.length > 0) {
                const currentState = useAppStore.getState()
                const targetItem = currentState.workItems.find(
                  (item) => item.type === 'image' && item.shotNumber === shotNumber
                )
                
                if (targetItem) {
                  const existingImages = [...targetItem.referenceImages]
                  
                  matchResult.matchedImages.forEach((img) => {
                    const newImage = {
                      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${img.slotIndex}`,
                      file: null as File | null,
                      preview: img.path,
                      path: img.path,
                      name: img.name,
                      order: img.slotIndex,
                      slotIndex: img.slotIndex,
                      characterName: img.characterName,
                    }
                    
                    const existingSlotIndex = existingImages.findIndex(i => i.slotIndex === img.slotIndex)
                    if (existingSlotIndex >= 0) {
                      existingImages[existingSlotIndex] = newImage
                    } else {
                      existingImages.push(newImage)
                    }
                  })
                  
                  batchUpdates.push({
                    id: targetItem.id,
                    updates: {
                      referenceImages: existingImages.slice(0, 6)
                    }
                  })
                }
              }

              if (index % 5 === 0 || index === shotData.length - 1) {
                await new Promise(resolve => requestAnimationFrame(resolve))
              }

              setTimeout(() => processNextShot(index + 1), 0)
            }

            processNextShot(0)
          } catch (err) {
            console.error('[BackgroundMatch] 扫描角色库失败:', err)
            setMatching(false)
            matchingRef.current = false
          }
        }, 100)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
      setImporting(false)
    }
  }, [importFromExcel, activeTask, batchUpdateWorkItems, setGeneratedImageForShot])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleClear = () => {
    setResult(null)
    setError(null)
    setMatchResults(null)
    setScannedImageCount(0)
    setThumbnailProgress({ current: 0, total: 0 })
    matchingRef.current = false
  }

  const totalMatched = matchResults?.reduce((sum, r) => sum + r.matchedImages.length, 0) || 0
  const totalUnmatched = matchResults?.reduce((sum, r) => sum + r.unmatchedCharacters.length, 0) || 0

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <FileSpreadsheet size={18} />
        <span>Excel导入</span>
      </div>

      {!result && !error && (
        <div
          className={styles.dropZone}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault()
            e.currentTarget.classList.add(styles.dragOver)
          }}
          onDragLeave={(e) => e.currentTarget.classList.remove(styles.dragOver)}
        >
          {importing ? (
            <div className={styles.loading}>
              <span className={styles.spinner} />
              <span>正在导入...</span>
            </div>
          ) : (
            <>
              <Upload size={32} />
              <span>点击或拖拽Excel文件</span>
              <span className={styles.hint}>支持 .xlsx, .xls 格式</span>
            </>
          )}
        </div>
      )}

      {result && (
        <div className={styles.result}>
          <div className={styles.successIcon}>
            <Check size={20} />
          </div>
          <div className={styles.resultInfo}>
            <span className={styles.fileName}>{result.fileName}</span>
            <span className={styles.stats}>
              成功导入 {result.totalRows} 条数据
            </span>
          </div>
          <button className={styles.clearBtn} onClick={handleClear}>
            <X size={16} />
          </button>
        </div>
      )}

      {matching && (
        <div className={styles.matchingProgress}>
          <Loader2 size={16} className={styles.spinning} />
          <span>正在匹配角色图片... ({matchProgress.current}/{matchProgress.total})</span>
        </div>
      )}

      {scanningImages && (
        <div className={styles.matchingProgress}>
          <Image size={16} className={styles.spinning} />
          <span>
            {thumbnailProgress.total > 0 
              ? `正在生成缩略图... (${thumbnailProgress.current}/${thumbnailProgress.total})`
              : '正在扫描Image目录...'}
          </span>
        </div>
      )}

      {scannedImageCount > 0 && !scanningImages && (
        <div className={styles.imageScanResult}>
          <Image size={16} />
          <span>已导入 {scannedImageCount} 张镜头图片</span>
        </div>
      )}

      {matchResults && matchResults.length > 0 && (
        <div className={styles.matchResult}>
          <div className={styles.matchHeader}>
            <Users size={16} />
            <span>角色匹配结果</span>
            <button
              className={styles.logToggle}
              onClick={() => setShowLogs(!showLogs)}
            >
              {showLogs ? '隐藏详情' : '查看详情'}
            </button>
          </div>
          <div className={styles.matchStats}>
            <span className={styles.matchSuccess}>✓ 匹配成功: {totalMatched}</span>
            <span className={styles.matchFail}>✗ 未匹配: {totalUnmatched}</span>
          </div>
          {showLogs && (
            <div className={styles.logList}>
              {getMatchLogs().map((log, index) => (
                <div
                  key={index}
                  className={`${styles.logItem} ${log.success ? styles.logSuccess : styles.logError}`}
                >
                  <span className={styles.logAction}>{log.action}</span>
                  <span className={styles.logDetails}>{log.details}</span>
                </div>
              ))}
            </div>
          )}
          {totalUnmatched > 0 && (
            <div className={styles.unmatchedWarning}>
              <AlertCircle size={14} />
              <span>部分角色未匹配，请检查角色库</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className={styles.error}>
          <AlertCircle size={20} />
          <span>{error}</span>
          <button className={styles.clearBtn} onClick={handleClear}>
            <X size={16} />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => handleFileSelect(e.target.files)}
        className={styles.hiddenInput}
      />
    </div>
  )
}

export default ExcelImporter
