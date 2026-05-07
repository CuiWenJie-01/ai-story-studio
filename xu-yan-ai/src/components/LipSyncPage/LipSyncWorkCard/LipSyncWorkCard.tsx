import React, { useCallback, useRef, useState, useEffect, memo } from 'react'
import { Mic, Upload, Play, Users, X, Check, Loader2, Plus, Minus, Zap, Pencil } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../../../store/appStore'
import { JimengService, TosService } from '../../../services/jimengService'
import { videoLog } from '../../../services/videoLogService'
import LazyImage from '../../LazyImage/LazyImage'
import { ImageEditor } from '../../ImageEditor'
import type { WorkItem, LipSyncSubject, LipSyncItemState } from '../../../types'
import styles from './LipSyncWorkCard.module.css'

const formatLipSyncError = (error: string | undefined): string => {
  if (!error) return '生成失败'
  const lower = error.toLowerCase()
  if (lower.includes('concurrent limit')) return '请求过于频繁，请稍后重试'
  if (lower.includes('access denied')) return '访问被拒绝，请检查 API 配置'
  if (lower.includes('sensitive') || lower.includes('real person')) return '图片包含敏感内容，请更换图片'
  if (lower.includes('上传请求失败') || lower.includes('upload')) return '文件上传失败，请检查网络连接'
  if (lower.includes('failed to fetch') || lower.includes('err_connection')) return '网络连接失败，请检查网络'
  if (lower.includes('timeout')) return '请求超时，请稍后重试'
  if (error.startsWith('请先')) return error  // 保留配置提示类的中文错误
  if (error.includes('未检测到')) return error  // 保留检测类的中文错误
  if (/^[\x20-\x7E]+$/.test(error) && error.length > 50) return '生成失败，请稍后重试'  // 长英文错误简化
  return error
}

interface LipSyncWorkCardProps {
  item: WorkItem
  isActive: boolean
  onClick: () => void
}

const DEFAULT_LIPSYNC_STATE: LipSyncItemState = {
  audioPath: '',
  audioName: '',
  subjects: [],
  selectedSubjectIds: [],
  prompt: '',
  resolution: 720,
  fastMode: true,
  lipsyncApiProvider: 'jimeng',
  status: 'idle',
  progress: 0,
  message: '',
}

const LipSyncWorkCard = memo<LipSyncWorkCardProps>(({ item, isActive, onClick }) => {
  const { 
    updateWorkItem, 
    removeWorkItem, 
    addWorkItemAfter,
    apiConfigs,
    activeTask,
  } = useAppStore(
    useShallow((state) => ({
      updateWorkItem: state.updateWorkItem,
      removeWorkItem: state.removeWorkItem,
      addWorkItemAfter: state.addWorkItemAfter,
      apiConfigs: state.apiConfigs,
      activeTask: state.activeTask,
    }))
  )

  const [lipSyncState, setLipSyncState] = useState<LipSyncItemState>(
    item.lipsyncState || DEFAULT_LIPSYNC_STATE
  )

  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [editingImagePath, setEditingImagePath] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const isExternalUpdateRef = useRef(false)
  const isInitialMountRef = useRef(true)
  const prevLipSyncStateRef = useRef<LipSyncItemState | undefined>(undefined)
  const prevWorkItemIdRef = useRef<string | null>(null)
  const isPollingRef = useRef(false)

  const persistState = useCallback((newState: Partial<LipSyncItemState>) => {
    console.log('[LipSync] persistState 调用:', newState)
    setLipSyncState(prev => {
      const updated = { ...prev, ...newState }
      console.log('[LipSync] 状态更新:', { 
        prev: prev.status, 
        new: updated.status,
        resultVideoUrl: updated.resultVideoUrl 
      })
      return updated
    })
  }, [])

  // 恢复正在进行的任务
  useEffect(() => {
    const state = item.lipsyncState
    // 只有当状态是 processing 且有 taskId，且当前没有在轮询时才启动轮询
    if (state && state.status === 'processing' && state.taskId && !isPollingRef.current) {
      console.log('[LipSync] 检测到正在进行的任务，恢复轮询:', state.taskId)
      isPollingRef.current = true
      
      const config = apiConfigs.jimeng
      if (!config?.apiKey || !config?.apiSecret) {
        persistState({ status: 'error', error: '请先在设置中配置即梦 API Key 和 Secret Key' })
        isPollingRef.current = false
        return
      }

      const service = new JimengService(config)
      // 重要：重置取消标志
      cancelledRef.current = false

      const pollTask = async () => {
        try {
          const result = await service.waitForCompletion(
            state.taskId!,
            (status, message) => {
              if (cancelledRef.current) return
              persistState({ progress: status === 'generating' ? 60 : 40, message })
            },
            5000,
            600000,
            () => cancelledRef.current
          )

          isPollingRef.current = false

          if (cancelledRef.current) {
            persistState({ status: 'idle', progress: 0, message: '已取消' })
            return
          }

          if (result.success && result.videoUrl) {
            console.log('[LipSync] 任务恢复完成:', result.videoUrl)
            
            let localVideoPath = result.videoUrl
            if (activeTask?.path) {
              persistState({ message: '正在保存视频...' })
              try {
                const { saveVideoToTaskFolder } = await import('../../../utils/fileSaver')
                const saveResult = await saveVideoToTaskFolder(
                  result.videoUrl,
                  activeTask.path,
                  item.shotNumber,
                  Date.now(),
                  config.cookie
                )
                if (saveResult.success && saveResult.path) {
                  localVideoPath = saveResult.path
                }
              } catch (saveError) {
                console.warn('[LipSync] 视频保存异常:', saveError)
              }
            }

            persistState({
              status: 'completed',
              progress: 100,
              message: '视频生成完成',
              resultVideoUrl: localVideoPath,
            })

            updateWorkItem(item.id, {
              generatedVideo: {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                url: localVideoPath || '',
                timestamp: Date.now(),
                prompt: state.prompt,
                firstFrame: item.firstFrame?.preview || '',
                lastFrame: '',
                duration: 5,
              }
            })
          } else {
            persistState({
              status: 'error',
              error: result.error || '视频生成失败',
            })
          }
        } catch (error) {
          isPollingRef.current = false
          persistState({
            status: 'error',
            error: error instanceof Error ? error.message : '视频生成失败',
          })
        }
      }

      pollTask()
    }
  }, [item.id, item.lipsyncState?.taskId, item.lipsyncState?.status])

  useEffect(() => {
    if (item.lipsyncState) {
      // 检查是否是真正需要同步的外部更新
      // 如果状态是 uploading/detecting/processing，不覆盖本地状态
      const externalStatus = item.lipsyncState.status
      const localStatus = lipSyncState.status
      
      // 如果本地状态是正在进行的操作，不覆盖
      if (localStatus === 'uploading' || localStatus === 'detecting' || localStatus === 'processing') {
        console.log('[LipSync] 本地状态正在进行，跳过外部同步:', { localStatus, externalStatus })
        return
      }
      
      // 如果外部状态和本地状态相同，跳过
      if (externalStatus === localStatus) {
        return
      }
      
      console.log('[LipSync] 同步外部状态:', { from: localStatus, to: externalStatus })
      isExternalUpdateRef.current = true
      setLipSyncState(item.lipsyncState)
    }
  }, [item.lipsyncState])

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      return
    }
    if (isExternalUpdateRef.current) {
      isExternalUpdateRef.current = false
      return
    }
    if (prevLipSyncStateRef.current !== lipSyncState || prevWorkItemIdRef.current !== item.id) {
      prevLipSyncStateRef.current = lipSyncState
      prevWorkItemIdRef.current = item.id
      queueMicrotask(() => {
        updateWorkItem(item.id, { lipsyncState: lipSyncState })
      })
    }
  }, [lipSyncState, item.id, updateWorkItem])

  const displayShotNumber = String(item.shotNumber)
  const isProcessing = lipSyncState.status === 'processing' || lipSyncState.status === 'detecting' || lipSyncState.status === 'uploading'

  const handleFrameSelect = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
    })

    if (!selected || Array.isArray(selected)) return

    const fileName = selected.split(/[/\\]/).pop() || ''
    updateWorkItem(item.id, {
      firstFrame: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: null,
        preview: selected,
        path: selected,
        name: fileName,
        order: 0,
      }
    })

    persistState({
      subjects: [],
      selectedSubjectIds: [],
      status: 'idle',
      resultVideoUrl: undefined,
      error: undefined,
      uploadedImageUrl: undefined,
    })
  }, [item.id, updateWorkItem, persistState])

  const handleAudioSelect = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }],
    })

    if (!selected || Array.isArray(selected)) return

    const fileName = selected.split(/[/\\]/).pop() || ''

    persistState({
      audioPath: selected,
      audioName: fileName,
      uploadedAudioUrl: undefined,
    })
  }, [persistState])

  const handleRemoveFirstFrame = useCallback(() => {
    updateWorkItem(item.id, { firstFrame: undefined })
    persistState({
      subjects: [],
      selectedSubjectIds: [],
      status: 'idle',
      resultVideoUrl: undefined,
      uploadedImageUrl: undefined,
    })
  }, [item.id, updateWorkItem, persistState])

  const handleRemoveAudio = useCallback(() => {
    persistState({
      audioPath: '',
      audioName: '',
      uploadedAudioUrl: undefined,
    })
  }, [persistState])

  const handleDetectSubjects = useCallback(async () => {
    if (!item.firstFrame?.preview) return

    const config = apiConfigs.jimeng
    const volcarkConfig = apiConfigs.volcark
    if (!config?.apiKey || !config?.apiSecret) {
      persistState({
        status: 'error',
        error: '请先在设置中配置即梦 API Key 和 Secret Key',
      })
      return
    }

    if (!volcarkConfig?.bucket) {
      persistState({
        status: 'error',
        error: '请先在设置中配置TOS存储桶名称',
      })
      return
    }

    persistState({
      status: 'uploading',
      progress: 10,
      message: '正在上传图片到TOS...',
    })

    try {
      const tosService = new TosService({
        accessKey: volcarkConfig.accessKey || '',
        secretKey: volcarkConfig.secretKey || '',
        bucket: volcarkConfig.bucket || '',
        region: volcarkConfig.region || 'cn-beijing',
        s3Endpoint: volcarkConfig.s3Endpoint,
      })

      const imagePath = item.firstFrame.path || item.firstFrame.preview
      const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
      const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      const objectKey = tosService.generateObjectKey('lipsync/images', ext)

      const uploadResult = await tosService.uploadFile(imagePath, objectKey, contentType)
      if (!uploadResult.success || !uploadResult.url) {
        videoLog.error('对口型 - 图片上传到TOS失败', {
          shotNumber: item.shotNumber,
          provider: 'TOS',
          errorMessage: uploadResult.error || '图片上传失败',
          extra: {
            imagePath,
            objectKey,
            bucket: volcarkConfig.bucket,
            region: volcarkConfig.region,
            s3Endpoint: volcarkConfig.s3Endpoint || '未配置',
            hasAccessKey: !!volcarkConfig.accessKey,
            hasSecretKey: !!volcarkConfig.secretKey,
          },
        })
        throw new Error(uploadResult.error || '图片上传失败')
      }

      const uploadedImageUrl = uploadResult.url
      persistState({
        status: 'detecting',
        progress: 30,
        message: '正在检测主体...',
        uploadedImageUrl,
      })

      const service = new JimengService(config)
      const result = await service.detectSubjects(uploadedImageUrl, activeTask?.path || undefined)

      if (!result.success) {
        throw new Error(result.error || '主体检测失败')
      }

      if (!result.hasSubject || !result.maskUrls || result.maskUrls.length === 0) {
        persistState({
          status: 'error',
          error: '未检测到可识别的人物主体',
        })
        return
      }

      const subjects: LipSyncSubject[] = result.maskUrls.map((maskUrl, index) => ({
        id: index,
        maskUrl,
        previewUrl: result.maskImages?.[index],
        selected: false,
      }))

      persistState({
        subjects,
        selectedSubjectIds: [],
        status: 'ready',
        progress: 100,
        message: `检测到 ${subjects.length} 个主体`,
      })
    } catch (error) {
      videoLog.error('对口型 - 主体检测失败', {
        shotNumber: item.shotNumber,
        errorMessage: error instanceof Error ? error.message : '主体检测失败',
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      persistState({
        status: 'error',
        error: error instanceof Error ? error.message : '主体检测失败',
      })
    }
  }, [item.firstFrame, apiConfigs.jimeng, apiConfigs.volcark, activeTask, persistState])

  const handleSubjectToggle = useCallback((subjectId: number) => {
    setLipSyncState(prev => {
      const newSelectedIds = prev.selectedSubjectIds.includes(subjectId)
        ? prev.selectedSubjectIds.filter(id => id !== subjectId)
        : [...prev.selectedSubjectIds, subjectId]

      return {
        ...prev,
        selectedSubjectIds: newSelectedIds,
      }
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    const isVolcark = lipSyncState.lipsyncApiProvider === 'volcark'

    // 即梦要求图片和音频都必须有；Seedance 只要求图片
    if (!item.firstFrame?.preview) return
    if (!isVolcark && !lipSyncState.audioPath) return

    cancelledRef.current = false
    isPollingRef.current = true
    persistState({
      status: 'uploading',
      progress: 5,
      message: '正在上传文件到TOS...',
      resultVideoUrl: undefined,
    })

    try {
      // ========== Seedance 2.0 分支 ==========
      if (isVolcark) {
        const volcarkConfig = apiConfigs.volcark
        if (!volcarkConfig?.apiKey) {
          isPollingRef.current = false
          persistState({ status: 'error', error: '请先在设置中配置火山方舟 API Key' })
          return
        }

        // 上传图片到 TOS
        const jimengConfig = apiConfigs.jimeng
        if (!jimengConfig?.apiKey || !jimengConfig?.apiSecret || !volcarkConfig?.bucket) {
          isPollingRef.current = false
          persistState({ status: 'error', error: '请先在即梦设置中配置 TOS 存储（用于上传图片）' })
          return
        }

        const volcarkCfg = apiConfigs.volcark
        const tosService = new TosService({
          accessKey: volcarkCfg.accessKey || '',
          secretKey: volcarkCfg.secretKey || '',
          bucket: volcarkCfg.bucket || '',
          region: volcarkCfg.region || 'cn-beijing',
          s3Endpoint: volcarkCfg.s3Endpoint,
        })

        let imageUrl = lipSyncState.uploadedImageUrl
        if (!imageUrl) {
          const imagePath = item.firstFrame.path || item.firstFrame.preview
          const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
          const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
          const objectKey = tosService.generateObjectKey('lipsync/images', ext)
          const uploadResult = await tosService.uploadFile(imagePath, objectKey, contentType)
          if (!uploadResult.success || !uploadResult.url) {
            isPollingRef.current = false
            videoLog.error('对口型(Seedance) - 图片上传到TOS失败', {
              shotNumber: item.shotNumber,
              provider: 'Seedance 2.0',
              errorMessage: uploadResult.error || '图片上传失败',
              extra: {
                imagePath,
                objectKey,
                bucket: volcarkCfg.bucket,
                region: volcarkCfg.region,
                s3Endpoint: volcarkCfg.s3Endpoint || '未配置',
                hasAccessKey: !!volcarkCfg.accessKey,
                hasSecretKey: !!volcarkCfg.secretKey,
              },
            })
            throw new Error(uploadResult.error || '图片上传失败')
          }
          imageUrl = uploadResult.url
        }

        if (cancelledRef.current) { isPollingRef.current = false; persistState({ status: 'idle', progress: 0, message: '已取消' }); return }

        // 音频可选
        let audioUrl: string | undefined
        if (lipSyncState.audioPath) {
          persistState({ progress: 15, message: '正在上传音频到TOS...' })
          if (!lipSyncState.uploadedAudioUrl) {
            const audioPath = lipSyncState.audioPath
            const ext = audioPath.split('.').pop()?.toLowerCase() || 'mp3'
            const contentType = ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg'
            const objectKey = tosService.generateObjectKey('lipsync/audio', ext)
            const uploadResult = await tosService.uploadFile(audioPath, objectKey, contentType)
            if (uploadResult.success && uploadResult.url) {
              audioUrl = uploadResult.url
            }
          } else {
            audioUrl = lipSyncState.uploadedAudioUrl
          }
        }

        if (cancelledRef.current) { isPollingRef.current = false; persistState({ status: 'idle', progress: 0, message: '已取消' }); return }

        persistState({
          status: 'processing',
          progress: 25,
          message: '正在创建 Seedance 视频任务...',
          uploadedImageUrl: imageUrl,
          uploadedAudioUrl: audioUrl,
        })

        const { SeedanceService } = await import('../../../services/seedanceService')
        const seedanceService = new SeedanceService(volcarkConfig)

        const seedanceModel = volcarkConfig.videoModel || 'doubao-seedance-2-0-260128'

        const createResult = await seedanceService.createVideoTask({
          prompt: lipSyncState.prompt || '让图片中的人物自然地动起来',
          model: seedanceModel,
          firstFrameUrl: imageUrl,
          audioUrl,
          aspectRatio: 'adaptive',
          duration: lipSyncState.duration || 5,
          generateAudio: true,
        })

        if (!createResult.success || !createResult.taskId) {
          isPollingRef.current = false
          videoLog.error('对口型(Seedance) - 创建任务失败', {
            shotNumber: item.shotNumber,
            provider: 'Seedance 2.0',
            model: seedanceModel,
            errorMessage: createResult.error || '创建 Seedance 任务失败',
          })
          throw new Error(createResult.error || '创建 Seedance 任务失败')
        }

        persistState({ taskId: createResult.taskId, progress: 30, message: 'Seedance 任务已创建，等待处理...' })

        const result = await seedanceService.waitForCompletion(
          createResult.taskId,
          (progress, _status, message) => {
            if (cancelledRef.current) return
            persistState({ progress: 30 + progress * 0.6, message })
          },
          5000,
          600000,
          () => cancelledRef.current
        )

        if (cancelledRef.current) { isPollingRef.current = false; persistState({ status: 'idle', progress: 0, message: '已取消' }); return }

        if (!result.success || !result.videoUrl) {
          isPollingRef.current = false
          videoLog.error('对口型(Seedance) - 视频生成失败', {
            shotNumber: item.shotNumber,
            provider: 'Seedance 2.0',
            model: seedanceModel,
            taskId: createResult.taskId,
            errorMessage: result.error || 'Seedance 视频生成失败',
          })
          throw new Error(result.error || 'Seedance 视频生成失败')
        }

        // 保存视频
        let localVideoPath = result.videoUrl
        if (activeTask?.path) {
          persistState({ message: '正在保存视频...' })
          try {
            const { saveVideoToTaskFolder } = await import('../../../utils/fileSaver')
            const saveResult = await saveVideoToTaskFolder(result.videoUrl, activeTask.path, item.shotNumber, Date.now())
            if (saveResult.success && saveResult.path) {
              localVideoPath = saveResult.path
            }
          } catch (saveError) {
            console.warn('[LipSync-Seedance] 视频保存异常:', saveError)
          }
        }

        persistState({ status: 'completed', progress: 100, message: '视频生成完成', resultVideoUrl: localVideoPath })
        isPollingRef.current = false

        updateWorkItem(item.id, {
          generatedVideo: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            url: localVideoPath || '',
            timestamp: Date.now(),
            prompt: lipSyncState.prompt,
            firstFrame: item.firstFrame?.preview || '',
            lastFrame: '',
            duration: 5,
          }
        })
        return
      }

      // ========== 即梦分支（原有逻辑） ==========
      const config = apiConfigs.jimeng
      const volcarkConfig = apiConfigs.volcark
      if (!config?.apiKey || !config?.apiSecret) {
        isPollingRef.current = false
        persistState({ status: 'error', error: '请先在设置中配置即梦 API Key 和 Secret Key' })
        return
      }

      if (!volcarkConfig?.bucket) {
        isPollingRef.current = false
        persistState({ status: 'error', error: '请先在设置中配置TOS存储桶名称' })
        return
      }

      const tosService = new TosService({
        accessKey: volcarkConfig.accessKey || '',
        secretKey: volcarkConfig.secretKey || '',
        bucket: volcarkConfig.bucket || '',
        region: volcarkConfig.region || 'cn-beijing',
        s3Endpoint: volcarkConfig.s3Endpoint,
      })

      let imageUrl = lipSyncState.uploadedImageUrl
      if (!imageUrl) {
        const imagePath = item.firstFrame.path || item.firstFrame.preview
        const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
        const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        const objectKey = tosService.generateObjectKey('lipsync/images', ext)
        const uploadResult = await tosService.uploadFile(imagePath, objectKey, contentType)
        if (!uploadResult.success || !uploadResult.url) {
          isPollingRef.current = false
          videoLog.error('对口型(即梦) - 图片上传到TOS失败', {
            shotNumber: item.shotNumber,
            provider: '即梦',
            errorMessage: uploadResult.error || '图片上传失败',
            extra: {
              imagePath,
              objectKey,
              bucket: volcarkConfig.bucket,
              region: volcarkConfig.region,
              s3Endpoint: volcarkConfig.s3Endpoint || '未配置',
              hasAccessKey: !!volcarkConfig.accessKey,
              hasSecretKey: !!volcarkConfig.secretKey,
            },
          })
          throw new Error(uploadResult.error || '图片上传失败')
        }
        imageUrl = uploadResult.url
      }

      if (cancelledRef.current) { isPollingRef.current = false; persistState({ status: 'idle', progress: 0, message: '已取消' }); return }

      persistState({ progress: 15, message: '正在上传音频到TOS...' })

      let audioUrl = lipSyncState.uploadedAudioUrl
      if (!audioUrl && lipSyncState.audioPath) {
        const audioPath = lipSyncState.audioPath
        const ext = audioPath.split('.').pop()?.toLowerCase() || 'mp3'
        const contentType = ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg'
        const objectKey = tosService.generateObjectKey('lipsync/audio', ext)
        const uploadResult = await tosService.uploadFile(audioPath, objectKey, contentType)
        if (!uploadResult.success || !uploadResult.url) {
          isPollingRef.current = false
          videoLog.error('对口型(即梦) - 音频上传到TOS失败', {
            shotNumber: item.shotNumber,
            provider: '即梦',
            errorMessage: uploadResult.error || '音频上传失败',
            extra: { audioPath, objectKey },
          })
          throw new Error(uploadResult.error || '音频上传失败')
        }
        audioUrl = uploadResult.url
      }

      if (!audioUrl) { isPollingRef.current = false; throw new Error('音频URL无效') }

      if (cancelledRef.current) { isPollingRef.current = false; persistState({ status: 'idle', progress: 0, message: '已取消' }); return }

      persistState({
        status: 'processing',
        progress: 25,
        message: '正在生成视频...',
        uploadedImageUrl: imageUrl,
        uploadedAudioUrl: audioUrl,
      })

      const service = new JimengService(config)

      const maskUrls = lipSyncState.selectedSubjectIds.length > 0
        ? lipSyncState.subjects
            .filter(s => lipSyncState.selectedSubjectIds.includes(s.id))
            .map(s => s.maskUrl)
        : undefined

      const result = await service.generateLipSyncVideo(
        {
          imageUrl,
          audioUrl,
          maskUrls,
          prompt: lipSyncState.prompt,
          resolution: lipSyncState.resolution,
          fastMode: lipSyncState.fastMode,
        },
        (status, message) => {
          if (cancelledRef.current) return
          persistState({ progress: status === 'generating' ? 60 : 40, message })
        },
        () => cancelledRef.current,
        (taskId) => {
          persistState({ taskId })
        }
      )

      if (cancelledRef.current) { isPollingRef.current = false; persistState({ status: 'idle', progress: 0, message: '已取消' }); return }

      if (!result.success) {
        isPollingRef.current = false
        videoLog.error('对口型(即梦) - 视频生成失败', {
          shotNumber: item.shotNumber,
          provider: '即梦',
          errorMessage: result.error || '视频生成失败',
        })
        throw new Error(result.error || '视频生成失败')
      }

      let localVideoPath = result.videoUrl
      if (result.videoUrl && activeTask?.path) {
        persistState({ message: '正在保存视频...' })
        try {
          const { saveVideoToTaskFolder } = await import('../../../utils/fileSaver')
          const saveResult = await saveVideoToTaskFolder(result.videoUrl, activeTask.path, item.shotNumber, Date.now(), config.cookie)
          if (saveResult.success && saveResult.path) {
            localVideoPath = saveResult.path
          }
        } catch (saveError) {
          console.warn('[LipSync] 视频保存异常:', saveError)
        }
      }

      persistState({ status: 'completed', progress: 100, message: '视频生成完成', resultVideoUrl: localVideoPath })
      isPollingRef.current = false

      updateWorkItem(item.id, {
        generatedVideo: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url: localVideoPath || '',
          timestamp: Date.now(),
          prompt: lipSyncState.prompt,
          firstFrame: item.firstFrame?.preview || '',
          lastFrame: '',
          duration: 5,
        }
      })
    } catch (error) {
      isPollingRef.current = false
      const errorMsg = error instanceof Error ? error.message : '视频生成失败'
      videoLog.error('对口型 - 生成流程异常', {
        shotNumber: item.shotNumber,
        provider: lipSyncState.lipsyncApiProvider === 'volcark' ? 'Seedance 2.0' : '即梦',
        errorMessage: errorMsg,
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      persistState({
        status: 'error',
        error: errorMsg,
      })
    }
  }, [item, lipSyncState, apiConfigs.jimeng, apiConfigs.volcark, activeTask, updateWorkItem, persistState])

  const handleCancel = useCallback(() => {
    cancelledRef.current = true
    isPollingRef.current = false
    persistState({ status: 'idle', progress: 0, message: '已取消' })
  }, [persistState])

  const handleReset = useCallback(() => {
    cancelledRef.current = false
    isPollingRef.current = false
    persistState(DEFAULT_LIPSYNC_STATE)
  }, [persistState])

  const handleAddShot = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    addWorkItemAfter(item.id, item.type)
  }, [item.id, item.type, addWorkItemAfter])

  const handleRemoveShot = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    removeWorkItem(item.id)
  }, [item.id, removeWorkItem])

  const handleImagePreview = useCallback((e: React.MouseEvent, image: string) => {
    e.stopPropagation()
    const assetUrl = image.match(/^[A-Za-z]:[/\\]/) ? convertFileSrc(image) : image
    setPreviewImage(assetUrl)
  }, [])

  const closePreview = useCallback(() => {
    setPreviewImage(null)
  }, [])

  const audioSrc = lipSyncState.audioPath?.match(/^[A-Za-z]:[/\\]/) 
    ? convertFileSrc(lipSyncState.audioPath) 
    : lipSyncState.audioPath

  const isVolcark = lipSyncState.lipsyncApiProvider === 'volcark'
  const canDetect = item.firstFrame && lipSyncState.status !== 'detecting' && !isVolcark
  const canGenerate = item.firstFrame && 
    (isVolcark ? true : !!lipSyncState.audioPath) &&
    (lipSyncState.status === 'ready' || lipSyncState.status === 'idle')

  return (
    <>
      <div
        className={`${styles.card} ${isActive ? styles.active : ''}`}
        onClick={onClick}
        data-shot-number={item.shotNumber}
      >
        <div className={styles.cardHeader}>
          <div className={styles.shotInfo}>
            <span className={styles.typeIcon}>
              <Mic size={16} />
            </span>
            <span className={styles.shotNumber}>#{displayShotNumber}</span>
          </div>
          {item.excelData?.novelText && (
            <p className={styles.novelText}>{item.excelData.novelText}</p>
          )}
          <div className={styles.headerActions}>
            <button 
              className={styles.addShotBtn}
              onClick={handleAddShot}
              title="添加镜头"
            >
              <Plus size={14} />
            </button>
            <button 
              className={styles.removeShotBtn}
              onClick={handleRemoveShot}
              title="删除镜头"
            >
              <Minus size={14} />
            </button>
          </div>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.leftSection}>
            <div className={styles.sectionTitle}>首帧图片</div>
            <div className={styles.frameArea}>
              {item.firstFrame?.preview ? (
                <div className={styles.framePreview} onDoubleClick={(e) => handleImagePreview(e, item.firstFrame!.preview)}>
                  <LazyImage
                    src={item.firstFrame.preview}
                    alt="首帧"
                    className={styles.frameImage}
                  />
                  <button
                    className={styles.removeBtn}
                    onClick={(e) => { e.stopPropagation(); handleRemoveFirstFrame() }}
                  >
                    <X size={12} />
                  </button>
                  {item.firstFrame.path && (
                    <button
                      className={styles.editBtn}
                      onClick={(e) => { e.stopPropagation(); setEditingImagePath(item.firstFrame!.path || item.firstFrame!.preview) }}
                      title="编辑图片"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
              ) : (
                <button className={styles.uploadBtn} onClick={handleFrameSelect}>
                  <Upload size={20} />
                  <span>上传图片</span>
                </button>
              )}
            </div>
          </div>

          <div className={styles.audioSection} style={isVolcark ? { opacity: 0.6 } : undefined}>
            <div className={styles.sectionTitle}>驱动音频{isVolcark ? '（可选）' : ''}</div>
            <div className={styles.audioArea}>
              {lipSyncState.audioPath ? (
                <div className={styles.audioPreview}>
                  <div className={styles.audioInfo}>
                    <Mic size={14} />
                    <span title={lipSyncState.audioName}>{lipSyncState.audioName}</span>
                    <button
                      className={styles.removeAudioBtn}
                      onClick={(e) => { e.stopPropagation(); handleRemoveAudio() }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                  {audioSrc && (
                    <audio 
                      src={audioSrc} 
                      controls 
                      className={styles.audioPlayer}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              ) : (
                <button className={styles.uploadBtn} onClick={handleAudioSelect}>
                  <Mic size={20} />
                  <span>上传音频</span>
                </button>
              )}
            </div>
          </div>

          {!isVolcark && (
          <div className={styles.subjectSection}>
            <div className={styles.sectionTitle}>
              人物选择
              {lipSyncState.subjects.length > 0 && (
                <span className={styles.subjectCount}>({lipSyncState.subjects.length}个)</span>
              )}
            </div>
            <div className={styles.subjectArea}>
              {lipSyncState.subjects.length > 0 ? (
                <div className={styles.subjectGrid}>
                  {lipSyncState.subjects.map((subject) => (
                    <div
                      key={subject.id}
                      className={`${styles.subjectCard} ${lipSyncState.selectedSubjectIds.includes(subject.id) ? styles.subjectCardSelected : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleSubjectToggle(subject.id) }}
                    >
                      {subject.previewUrl ? (
                        <img 
                          src={convertFileSrc(subject.previewUrl)} 
                          alt={`人物 ${subject.id + 1}`}
                          className={styles.subjectImage}
                        />
                      ) : (
                        <div className={styles.subjectPlaceholder}>
                          <Users size={20} />
                        </div>
                      )}
                      <div className={styles.subjectCheck}>
                        <Check size={10} />
                      </div>
                      <span className={styles.subjectLabel}>人物 {subject.id + 1}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptySubject}>
                  <Users size={24} />
                  <span>上传图片后检测人物</span>
                </div>
              )}
            </div>
          </div>
          )}

          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>参数设置</div>
            <div className={styles.settingsContent}>
              <div className={styles.settingItem}>
                <label>API</label>
                <select
                  value={lipSyncState.lipsyncApiProvider || 'jimeng'}
                  onChange={(e) => persistState({ lipsyncApiProvider: e.target.value as 'jimeng' | 'volcark' })}
                  className={styles.resolutionSelect}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="jimeng">即梦（对口型）</option>
                  <option value="volcark">Seedance 2.0</option>
                </select>
              </div>
              <div className={styles.settingItem}>
                <label>分辨率</label>
                <select
                  value={lipSyncState.resolution}
                  onChange={(e) => persistState({ resolution: parseInt(e.target.value) as 720 | 1080 })}
                  className={styles.resolutionSelect}
                  onClick={(e) => e.stopPropagation()}
                >
                  {isVolcark ? (
                    <>
                      <option value={480}>480p</option>
                      <option value={720}>720p</option>
                    </>
                  ) : (
                    <>
                      <option value={720}>720p</option>
                      <option value={1080}>1080p</option>
                    </>
                  )}
                </select>
              </div>
              {isVolcark && (
              <div className={styles.settingItem}>
                <label>时长 {lipSyncState.duration || 5}秒</label>
                <input
                  type="range"
                  min={4}
                  max={15}
                  step={1}
                  value={lipSyncState.duration || 5}
                  onChange={(e) => persistState({ duration: parseInt(e.target.value) })}
                  onClick={(e) => e.stopPropagation()}
                  className={styles.durationSlider}
                  style={{ '--progress': `${(((lipSyncState.duration || 5) - 4) / 11) * 100}%` } as React.CSSProperties}
                />
              </div>
              )}
              {!isVolcark && (
              <div className={styles.settingItem}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={lipSyncState.fastMode}
                    onChange={(e) => persistState({ fastMode: e.target.checked })}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Zap size={14} />
                  快速模式
                </label>
                <span className={styles.hintText}>
                  {lipSyncState.resolution === 720 ? '推荐开启' : '推荐关闭'}
                </span>
              </div>
              )}
              <div className={styles.settingItem}>
                <label>提示词{isVolcark ? '' : '（可选）'}</label>
                <textarea
                  value={lipSyncState.prompt}
                  onChange={(e) => persistState({ prompt: e.target.value })}
                  placeholder={isVolcark ? '描述画面动作，如：人物微笑着说话...' : '输入提示词...'}
                  className={styles.promptInput}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>

          <div className={styles.resultSection}>
            <div className={styles.sectionTitle}>生成结果</div>
            <div className={styles.resultArea}>
              {lipSyncState.status === 'completed' && lipSyncState.resultVideoUrl ? (
                <div className={styles.resultPreview}>
                  <video
                    src={lipSyncState.resultVideoUrl.match(/^[A-Za-z]:[/\\]/) 
                      ? convertFileSrc(lipSyncState.resultVideoUrl) 
                      : lipSyncState.resultVideoUrl}
                    controls
                    className={styles.resultVideo}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : isProcessing ? (
                <div className={styles.progressArea}>
                  <Loader2 size={24} className={styles.spinning} />
                  <span>{lipSyncState.message}</span>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill} 
                      style={{ width: `${lipSyncState.progress}%` }}
                    />
                  </div>
                </div>
              ) : lipSyncState.status === 'error' ? (
                <div className={styles.errorArea}>
                  <X size={24} className={styles.errorIcon} />
                  <span>{formatLipSyncError(lipSyncState.error)}</span>
                </div>
              ) : (
                <div className={styles.emptyResult}>
                  <Play size={24} />
                  <span>等待生成</span>
                </div>
              )}
            </div>
            <div className={styles.actions}>
              {lipSyncState.status === 'idle' && !isVolcark && (
                <button
                  className={styles.detectBtn}
                  onClick={(e) => { e.stopPropagation(); handleDetectSubjects() }}
                  disabled={!canDetect}
                >
                  <Users size={14} />
                  检测人物
                </button>
              )}
              {(lipSyncState.status === 'idle' || lipSyncState.status === 'ready') && (
                <button
                  className={styles.generateBtn}
                  onClick={(e) => { e.stopPropagation(); handleGenerate() }}
                  disabled={!canGenerate}
                >
                  <Play size={14} />
                  生成视频
                </button>
              )}
              {isProcessing && (
                <button
                  className={styles.cancelBtn}
                  onClick={(e) => { e.stopPropagation(); handleCancel() }}
                >
                  <X size={14} />
                  取消
                </button>
              )}
              {(lipSyncState.status === 'completed' || lipSyncState.status === 'error') && (
                <button
                  className={styles.resetBtn}
                  onClick={(e) => { e.stopPropagation(); handleReset() }}
                >
                  重置
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewImage && (
        <div className={styles.previewOverlay} onClick={closePreview}>
          <div className={styles.previewContent}>
            <img src={previewImage} alt="预览" />
            <button className={styles.closePreviewBtn} onClick={closePreview}>
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {editingImagePath && (
        <ImageEditor
          imagePath={editingImagePath}
          imageName={item.firstFrame?.name || '素材'}
          onSave={(newPath) => {
            setEditingImagePath(null)
            persistState({ uploadedImageUrl: undefined })
            // 更新 firstFrame 为编辑后的新路径
            updateWorkItem(item.id, {
              firstFrame: item.firstFrame ? { ...item.firstFrame, path: newPath, preview: newPath, timestamp: Date.now() } : undefined,
            })
          }}
          onClose={() => setEditingImagePath(null)}
        />
      )}
    </>
  )
})

export default LipSyncWorkCard
