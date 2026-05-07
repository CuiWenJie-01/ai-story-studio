import React, { useState, useCallback, useRef } from 'react'
import { RotateCcw, ZoomIn, ArrowUpDown, Play } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { RunningHubService } from '../../services/runningHubService'
import { viewAngleLog } from '../../services/viewAngleLogService'
import { saveImageToTaskFolder } from '../../utils/fileSaver'
import type { ViewAngleSettings } from '../../types'
import styles from './ViewAngleConverter.module.css'

const HORIZONTAL_ANGLE_OPTIONS = [
  { value: 0, label: '0°' },
  { value: 45, label: '45°' },
  { value: 90, label: '90°' },
  { value: 135, label: '135°' },
  { value: 180, label: '180°' },
  { value: 225, label: '225°' },
  { value: 270, label: '270°' },
  { value: 315, label: '315°' },
]

const VERTICAL_ANGLE_OPTIONS = [
  { value: -30, label: '-30°' },
  { value: 0, label: '0°' },
  { value: 30, label: '30°' },
  { value: 60, label: '60°' },
]

const ViewAngleConverter: React.FC = () => {
  const workItems = useAppStore(useCallback(state => state.workItems, []))
  const activeWorkId = useAppStore(useCallback(state => state.activeWorkId, []))
  const activeTask = useAppStore(useCallback(state => state.activeTask, []))
  const apiConfigs = useAppStore(useCallback(state => state.apiConfigs, []))
  const runningHubViewAngleMappingId = useAppStore(useCallback(state => state.runningHubViewAngleMappingId, []))
  const runningHubMappings = useAppStore(useCallback(state => state.runningHubMappings, []))
  const updateWorkItem = useAppStore(useCallback(state => state.updateWorkItem, []))

  const [settings, setSettings] = useState<ViewAngleSettings>({
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 5,
  })

  const cancelledRef = useRef(false)

  const activeItem = activeWorkId ? workItems.find(item => item.id === activeWorkId && item.type === 'image') : null

  const handleSettingChange = useCallback((key: keyof ViewAngleSettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleStartGeneration = useCallback(async () => {
    if (!activeItem) return

    if (!activeTask) {
      updateWorkItem(activeItem.id, {
        generationState: { 
          status: 'error', 
          progress: 0, 
          message: '请先选择任务',
          error: '请先选择任务'
        },
      })
      return
    }

    console.log('[ViewAngle] 开始生成按钮点击')
    console.log('[ViewAngle] 当前选中ID:', activeWorkId, '选中项:', activeItem ? `镜头${activeItem.shotNumber}` : '无')

    if (activeItem.referenceImages.length !== 1) {
      return
    }

    if (activeItem.generationState.status === 'processing') {
      return
    }

    const config = apiConfigs.runninghub
    if (!config?.apiKey) return

    const mapping = runningHubMappings.find(m => m.id === runningHubViewAngleMappingId)
    if (!mapping) return

    cancelledRef.current = false

    updateWorkItem(activeItem.id, {
      generationState: { status: 'processing', progress: 10, message: '视角转换中...' },
    })

    const service = new RunningHubService(config)

    try {
      console.log('[ViewAngle] 提交任务, 镜头:', activeItem.shotNumber)
      
      // 记录开始生成
      viewAngleLog.info('开始视角转换', {
        shotNumber: activeItem.shotNumber,
        provider: 'runninghub',
        extra: {
          horizontalAngle: settings.horizontalAngle,
          verticalAngle: settings.verticalAngle,
          zoom: settings.zoom,
          mappingId: mapping.id,
        }
      })
      
      // 记录请求参数
      viewAngleLog.info('提交视角转换任务', {
        shotNumber: activeItem.shotNumber,
        provider: 'runninghub',
        requestParams: {
          horizontalAngle: settings.horizontalAngle,
          verticalAngle: settings.verticalAngle,
          zoom: settings.zoom,
          mappingId: mapping.id,
          hasImage: !!activeItem.referenceImages[0].preview,
        }
      })
      
      const submitResult = await service.submitViewAngleTask(mapping, {
        image: activeItem.referenceImages[0].preview,
        horizontalAngle: settings.horizontalAngle,
        verticalAngle: settings.verticalAngle,
        zoom: settings.zoom,
      })

      console.log('[ViewAngle] 提交结果:', submitResult)
      
      // 记录响应结果
      viewAngleLog.info('视角转换任务响应', {
        shotNumber: activeItem.shotNumber,
        provider: 'runninghub',
        responseBody: submitResult,
      })

      if (!submitResult.success || !submitResult.taskId) {
        throw new Error(submitResult.error || '提交任务失败')
      }

      updateWorkItem(activeItem.id, {
        currentTaskId: submitResult.taskId,
      })

      console.log('[ViewAngle] 等待任务完成, taskId:', submitResult.taskId)
      
      // 记录任务提交成功
      viewAngleLog.info('视角转换任务提交成功', {
        shotNumber: activeItem.shotNumber,
        provider: 'runninghub',
        taskId: submitResult.taskId,
      })
      
      const result = await service.waitForCompletion(
        submitResult.taskId,
        (progress, message) => {
          updateWorkItem(activeItem.id, {
            generationState: { status: 'processing', progress: 10 + progress * 0.8, message },
          })
        },
        5000,
        300000,
        () => {
          const currentItem = useAppStore.getState().workItems.find(i => i.id === activeItem.id)
          return currentItem?.generationState.status !== 'processing'
        }
      )

      console.log('[ViewAngle] 任务完成结果:', result)

      if (result.cancelled) {
        updateWorkItem(activeItem.id, {
          generationState: { status: 'idle', progress: 0, message: '已取消' },
          currentTaskId: undefined,
        })
        // 记录任务取消
        viewAngleLog.info('视角转换任务已取消', {
          shotNumber: activeItem.shotNumber,
          provider: 'runninghub',
          taskId: submitResult.taskId,
        })
        return
      }

      if (!result.success) {
        throw new Error(result.error || '生成失败')
      }

      if (activeTask?.path && result.outputUrl) {
        try {
          await saveImageToTaskFolder(result.outputUrl, activeTask.path, activeItem.shotNumber, Date.now())
          console.log('[ViewAngle] 图片保存成功')
        } catch (saveError) {
          console.error('[ViewAngle] 保存图片失败:', saveError)
          // 记录保存失败
          viewAngleLog.warn('视角转换图片保存失败', {
            shotNumber: activeItem.shotNumber,
            provider: 'runninghub',
            taskId: submitResult.taskId,
            errorMessage: saveError instanceof Error ? saveError.message : '保存失败',
          })
        }
      }

      updateWorkItem(activeItem.id, {
        generatedImage: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url: result.outputUrl!,
          timestamp: Date.now(),
          prompt: activeItem.prompt,
          referenceImages: activeItem.referenceImages.map(img => img.preview),
        },
        generationState: { status: 'completed', progress: 100, message: '视角转换完成' },
        currentTaskId: undefined,
      })

      console.log('[ViewAngle] 镜头', activeItem.shotNumber, '处理完成')
      
      // 记录任务完成
      viewAngleLog.info('视角转换任务完成', {
        shotNumber: activeItem.shotNumber,
        provider: 'runninghub',
        taskId: submitResult.taskId,
      })

    } catch (error) {
      console.error('[ViewAngle] 处理失败:', error)
      updateWorkItem(activeItem.id, {
        generationState: { 
          status: 'error', 
          progress: 0, 
          message: error instanceof Error ? error.message : '生成失败',
          error: error instanceof Error ? error.message : '生成失败',
        },
        currentTaskId: undefined,
      })
      
      // 记录任务失败
      viewAngleLog.error('视角转换任务失败', {
        shotNumber: activeItem.shotNumber,
        provider: 'runninghub',
        errorMessage: error instanceof Error ? error.message : '生成失败',
        errorStack: error instanceof Error ? error.stack : undefined,
      })
    }
  }, [activeItem, activeWorkId, settings, apiConfigs.runninghub, runningHubMappings, runningHubViewAngleMappingId, activeTask, updateWorkItem])

  const canStart = activeItem && 
    activeItem.referenceImages.length === 1 && 
    activeItem.generationState.status !== 'processing'

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <RotateCcw size={18} />
        <span>视角转换</span>
      </div>

      <div className={styles.settings}>
        <div className={styles.settingGroup}>
          <label className={styles.settingLabel}>
            <RotateCcw size={14} />
            旋转角度
          </label>
          <div className={styles.angleGrid}>
            {HORIZONTAL_ANGLE_OPTIONS.map(option => (
              <button
                key={option.value}
                className={`${styles.angleBtn} ${settings.horizontalAngle === option.value ? styles.active : ''}`}
                onClick={() => handleSettingChange('horizontalAngle', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingGroup}>
          <label className={styles.settingLabel}>
            <ArrowUpDown size={14} />
            垂直倾斜
          </label>
          <div className={styles.angleRow}>
            {VERTICAL_ANGLE_OPTIONS.map(option => (
              <button
                key={option.value}
                className={`${styles.angleBtn} ${settings.verticalAngle === option.value ? styles.active : ''}`}
                onClick={() => handleSettingChange('verticalAngle', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingGroup}>
          <label className={styles.settingLabel}>
            <ZoomIn size={14} />
            距离 (0=远景, 10=大特写)
          </label>
          <div className={styles.zoomInput}>
            <input
              type="number"
              min="0"
              max="10"
              value={settings.zoom}
              onChange={(e) => {
                const value = Math.max(0, Math.min(10, parseInt(e.target.value) || 0))
                handleSettingChange('zoom', value)
              }}
              className={styles.zoomField}
            />
            <span className={styles.zoomHint}>0-10</span>
          </div>
        </div>
      </div>

      <div className={styles.taskInfo}>
        {activeItem ? (
          <>
            <span className={styles.taskCount}>
              当前选中: 镜头 {activeItem.shotNumber}
            </span>
            {activeItem.referenceImages.length === 1 ? (
              activeItem.generationState.status === 'processing' ? (
                <span className={styles.processingInfo}>正在处理中...</span>
              ) : (
                <span className={styles.taskReady}>✓ 有参考图，可以处理</span>
              )
            ) : (
              <span className={styles.taskWarning}>需要有且仅有1张参考图</span>
            )}
          </>
        ) : (
          <span className={styles.taskWarning}>请先选择一个图生图镜头</span>
        )}
      </div>

      <div className={styles.actions}>
        <button 
          className={styles.generateBtn}
          onClick={handleStartGeneration}
          disabled={!canStart}
        >
          <Play size={14} />
          开始生成
        </button>
      </div>
    </div>
  )
}

export default ViewAngleConverter
