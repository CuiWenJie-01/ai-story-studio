import React, { useState, useCallback, useMemo } from 'react'
import { Film, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { join } from '@tauri-apps/api/path'
import { useAppStore } from '../../store/appStore'
import { frameExtractorService } from '../../services/frameExtractorService'
import { notificationHistoryService } from '../../services/notificationHistoryService'
import type { ReferenceImage } from '../../types'
import styles from './FrameExtractor.module.css'

const FrameExtractor: React.FC = () => {
  const workItems = useAppStore(useCallback(state => state.workItems, []))
  const activeWorkId = useAppStore(useCallback(state => state.activeWorkId, []))
  const activeTask = useAppStore(useCallback(state => state.activeTask, []))
  const updateWorkItem = useAppStore(useCallback(state => state.updateWorkItem, []))
  const addToast = useAppStore(useCallback(state => state.addToast, []))

  const [isExtracting, setIsExtracting] = useState(false)
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null)

  const activeItem = useMemo(() => {
    return activeWorkId ? workItems.find(item => item.id === activeWorkId && item.type === 'video') : null
  }, [activeWorkId, workItems])

  const hasVideo = useMemo(() => {
    return activeItem?.generatedVideo?.url
  }, [activeItem])

  const canExtract = useMemo(() => {
    return activeItem && hasVideo && !isExtracting
  }, [activeItem, hasVideo, isExtracting])

  const targetShotNumber = useMemo(() => {
    if (!activeItem) return null
    const currentShotNum = typeof activeItem.shotNumber === 'string' 
      ? parseInt(activeItem.shotNumber, 10) 
      : activeItem.shotNumber
    return currentShotNum + 1
  }, [activeItem])

  const targetItemExists = useMemo(() => {
    if (!targetShotNumber) return false
    return workItems.some(item => {
      const shotNum = typeof item.shotNumber === 'string' 
        ? parseInt(item.shotNumber, 10) 
        : item.shotNumber
      return shotNum === targetShotNumber && item.type === 'video'
    })
  }, [targetShotNumber, workItems])

  const handleExtractFrame = useCallback(async () => {
    if (!activeItem || !hasVideo || !activeTask?.path) {
      addToast({
        type: 'error',
        title: '抽帧失败',
        message: '请确保已选择镜头且视频已生成',
      })
      return
    }

    const videoPath = activeItem.generatedVideo?.url
    if (!videoPath) {
      addToast({
        type: 'error',
        title: '抽帧失败',
        message: '找不到视频文件路径',
      })
      return
    }

    setIsExtracting(true)
    setLastResult(null)

    try {
      const imageDir = await join(activeTask.path, 'Image')
      const fileName = `镜头${targetShotNumber}_Image`

      console.log('[FrameExtractor] 开始抽帧:', {
        videoPath,
        imageDir,
        fileName,
        targetShotNumber,
      })

      const result = await frameExtractorService.extractLastFrame(
        videoPath,
        imageDir,
        fileName
      )

      if (result.success && result.imagePath) {
        const successMsg = `已提取镜头 #${activeItem.shotNumber} 的最后一帧到镜头 #${targetShotNumber}`
        setLastResult({ success: true, message: successMsg })
        addToast({
          type: 'success',
          title: '抽帧成功',
          message: successMsg,
        })
        notificationHistoryService.addRecord({
          type: 'success',
          title: `镜头 #${activeItem.shotNumber} 抽帧成功`,
          message: successMsg,
          shotNumber: String(activeItem.shotNumber),
        })

        const newFirstFrame: ReferenceImage = {
          id: `firstframe-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: null,
          preview: result.imagePath,
          path: result.imagePath,
          thumbnailUrl: result.thumbnailPath,
          name: fileName,
          order: 0,
          slotIndex: 0,
        }

        const nextVideoItem = workItems.find(item => {
          const shotNum = typeof item.shotNumber === 'string' 
            ? parseInt(item.shotNumber, 10) 
            : item.shotNumber
          return shotNum === targetShotNumber && item.type === 'video'
        })

        if (nextVideoItem) {
          if (!nextVideoItem.firstFrame?.path) {
            updateWorkItem(nextVideoItem.id, {
              firstFrame: newFirstFrame,
            })
            console.log('[FrameExtractor] 已关联到下一个视频镜头:', targetShotNumber)
          } else {
            console.log('[FrameExtractor] 目标视频镜头已有首帧，跳过覆盖:', targetShotNumber)
          }
        }

        const nextImageItem = workItems.find(item => {
          const shotNum = typeof item.shotNumber === 'string' 
            ? parseInt(item.shotNumber, 10) 
            : item.shotNumber
          return shotNum === targetShotNumber && item.type === 'image'
        })

        if (nextImageItem) {
          updateWorkItem(nextImageItem.id, {
            generatedImage: {
              id: `extracted-${Date.now()}`,
              url: result.imagePath,
              thumbnailUrl: result.thumbnailPath,
              timestamp: Date.now(),
              prompt: '',
              referenceImages: [],
            },
          })
          console.log('[FrameExtractor] 已关联到下一个图生图镜头:', targetShotNumber)
        }
      } else {
        const errorMsg = result.error || '抽帧失败'
        setLastResult({ success: false, message: errorMsg })
        addToast({
          type: 'error',
          title: '抽帧失败',
          message: errorMsg,
        })
        notificationHistoryService.addRecord({
          type: 'error',
          title: `镜头 #${activeItem.shotNumber} 抽帧失败`,
          message: errorMsg,
          shotNumber: String(activeItem.shotNumber),
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      setLastResult({ success: false, message: errorMsg })
      addToast({
        type: 'error',
        title: '抽帧失败',
        message: errorMsg,
      })
    } finally {
      setIsExtracting(false)
    }
  }, [
    activeItem,
    hasVideo,
    activeTask,
    targetShotNumber,
    targetItemExists,
    workItems,
    updateWorkItem,
    addToast,
  ])

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Film size={18} />
        <span>视频抽帧</span>
      </div>

      <div className={styles.content}>
        <div className={styles.info}>
          {activeItem ? (
            <>
              <div className={styles.infoRow}>
                <span className={styles.label}>当前镜头:</span>
                <span className={styles.value}>#{activeItem.shotNumber}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.label}>目标镜头:</span>
                <span className={styles.value}>#{targetShotNumber}</span>
                {targetItemExists ? (
                  <span className={styles.targetExists}>✓ 存在</span>
                ) : (
                  <span className={styles.targetNotExists}>不存在</span>
                )}
              </div>
              <div className={styles.infoRow}>
                <span className={styles.label}>视频状态:</span>
                {hasVideo ? (
                  <span className={styles.hasVideo}>✓ 已生成</span>
                ) : (
                  <span className={styles.noVideo}>未生成</span>
                )}
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>
              请选择一个图生视频镜头
            </div>
          )}
        </div>

        {lastResult && (
          <div className={`${styles.result} ${lastResult.success ? styles.success : styles.error}`}>
            {lastResult.success ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{lastResult.message}</span>
          </div>
        )}

        <button
          className={styles.extractBtn}
          onClick={handleExtractFrame}
          disabled={!canExtract}
        >
          {isExtracting ? (
            <>
              <Loader2 size={16} className={styles.spinning} />
              <span>抽帧中...</span>
            </>
          ) : (
            <>
              <Film size={16} />
              <span>抽帧</span>
            </>
          )}
        </button>

        <div className={styles.hint}>
          提取视频最后一帧，保存到 Image 文件夹
        </div>
      </div>
    </div>
  )
}

export default FrameExtractor
