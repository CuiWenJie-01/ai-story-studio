import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Settings, BookOpen, CheckCircle, Clock, AlertCircle, Home, Database, History } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { useAppStore } from './store/appStore'
import { taskQueueManager } from './services/taskQueueManager'
import { notificationHistoryService } from './services/notificationHistoryService'
import Sidebar from './components/Sidebar'
import ThemeToggle from './components/ThemeToggle'
import ExcelImporter from './components/ExcelImporter'
import ViewAngleConverter from './components/ViewAngleConverter'
import LipSyncPanel from './components/LipSyncPanel'
import LipSyncWorkCard from './components/LipSyncPage/LipSyncWorkCard/LipSyncWorkCard'
import VoiceWorkCard from './components/VoiceWorkCard'
import VoiceCharacterPanel from './components/VoiceCharacterPanel'
import WorkCard from './components/WorkCard'
import Seedance2Panel from './components/Seedance2Panel'
import SettingsPanel from './components/SettingsPanel'
import TaskDialog from './components/TaskDialog'
import TaskSelector from './components/TaskSelector'
import ShotNavigator from './components/ShotNavigator'
import PromptLibrary from './components/PromptLibrary'
import LibraryManager from './components/LibraryManager'
import HomePage from './components/HomePage'
import { ToastContainer } from './components/Toast/Toast'
import NotificationHistory from './components/NotificationHistory'
import FrameExtractor from './components/FrameExtractor'
import GlobalPrompt from './components/GlobalPrompt'
import ImportResultsButton from './components/ImportResultsButton'
import BatchExport from './components/BatchExport/BatchExport'
import EulaModal from './components/EulaModal'
import type { WorkType } from './types'
import styles from './App.module.css'

const useWorkItemsByType = (type: WorkType) => {
  const workItems = useAppStore(useShallow(state => state.workItems))
  return useMemo(() => {
    const items: typeof workItems = []
    for (let i = 0; i < workItems.length; i++) {
      if (workItems[i].type === type) {
        items.push(workItems[i])
      }
    }
    return items
  }, [workItems, type])
}

const useActiveItem = () => {
  const workItems = useAppStore(useShallow(state => state.workItems))
  const activeWorkId = useAppStore(state => state.activeWorkId)
  return useMemo(() => {
    for (const item of workItems) {
      if (item.id === activeWorkId) return item
    }
    return undefined
  }, [workItems, activeWorkId])
}

const useProcessingStats = () => {
  const workItems = useAppStore(useShallow(state => state.workItems))
  return useMemo(() => {
    let processingCount = 0
    let completedCount = 0
    let errorCount = 0
    for (const item of workItems) {
      if (item.generationState.status === 'processing' || item.generationState.status === 'pending') {
        processingCount++
      } else if (item.generationState.status === 'completed') {
        completedCount++
      } else if (item.generationState.status === 'error') {
        errorCount++
      }
    }
    return { processingCount, completedCount, errorCount }
  }, [workItems])
}

function App() {
  const { 
    theme, 
    activeWorkId,
    setActiveWorkId, 
    initDefaultItems, 
    ensureDefaultMappings,
    settings,
    activeTask,
    imageApiProvider,
    videoApiProvider,
    apiConfigs,
    clearWorkItems,
    setActiveTask,
    toasts,
    removeToast,
    user,
    refreshUserInfo,
    saveProjectImmediately,
    lastActiveMode,
    setLastActiveMode,
    eulaAccepted,
    setEulaAccepted,
    addTask,
    tasks,
    loadProjectData,
    restoreProjectData,
    addToast,
  } = useAppStore(useShallow(state => ({
    theme: state.theme,
    activeWorkId: state.activeWorkId,
    setActiveWorkId: state.setActiveWorkId,
    initDefaultItems: state.initDefaultItems,
    ensureDefaultMappings: state.ensureDefaultMappings,
    settings: state.settings,
    activeTask: state.activeTask,
    imageApiProvider: state.imageApiProvider,
    videoApiProvider: state.videoApiProvider,
    apiConfigs: state.apiConfigs,
    clearWorkItems: state.clearWorkItems,
    setActiveTask: state.setActiveTask,
    toasts: state.toasts,
    removeToast: state.removeToast,
    user: state.user,
    refreshUserInfo: state.refreshUserInfo,
    saveProjectImmediately: state.saveProjectImmediately,
    lastActiveMode: state.lastActiveMode,
    setLastActiveMode: state.setLastActiveMode,
    eulaAccepted: state.eulaAccepted,
    setEulaAccepted: state.setEulaAccepted,
    addTask: state.addTask,
    tasks: state.tasks,
    loadProjectData: state.loadProjectData,
    restoreProjectData: state.restoreProjectData,
    addToast: state.addToast,
  })))
  
  const [activeMode, setActiveMode] = useState<WorkType>(lastActiveMode)
  const [showSettings, setShowSettings] = useState(false)
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [showTaskSelector, setShowTaskSelector] = useState(false)
  const [showPromptLibrary, setShowPromptLibrary] = useState(false)
  const [showLibraryManager, setShowLibraryManager] = useState(false)
  const [showNotificationHistory, setShowNotificationHistory] = useState(false)
  const [showHome, setShowHome] = useState(true)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showEula, setShowEula] = useState(false)
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasRefreshedUser = useRef(false)
  const showHomeRef = useRef(true) // 用于跟踪当前是否在首页

  // 同步 showHome 状态到 ref，供关闭事件监听器使用
  useEffect(() => {
    showHomeRef.current = showHome
  }, [showHome])

  // 检查 EULA 是否已接受 - 只在主页显示
  useEffect(() => {
    if (!eulaAccepted && showHome) {
      setShowEula(true)
    } else {
      setShowEula(false)
    }
  }, [eulaAccepted, showHome])

  // 处理接受 EULA
  const handleAcceptEula = useCallback(() => {
    setEulaAccepted(true)
    setShowEula(false)
  }, [setEulaAccepted])

  // 处理拒绝 EULA - 退出应用
  const handleRejectEula = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  }, [])

  const imageItems = useWorkItemsByType('image')
  const videoItems = useWorkItemsByType('video')
  const lipsyncItems = useWorkItemsByType('lipsync')
  const voiceItems = useWorkItemsByType('voice')
  const activeItem = useActiveItem()
  const { processingCount, completedCount, errorCount } = useProcessingStats()
  
  // 获取完整的 workItems 和 seedance2Data 用于自动保存
  const workItems = useAppStore(useShallow(state => state.workItems))
  const seedance2Data = useAppStore(useShallow(state => state.seedance2Data))
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedWorkItemsRef = useRef<string>('')
  const lastSavedSeedance2DataRef = useRef<string>('')

  // 只在应用首次加载且没有活动项目时初始化默认数据
  useEffect(() => {
    // 如果有活动项目，不要初始化默认数据（数据会从项目文件加载）
    if (activeTask?.path) {
      console.log('[App] 有活动项目，跳过默认数据初始化')
      return
    }
    
    // 检查是否已经有工作项（可能是从其他方式加载的）
    if (workItems.length > 0) {
      console.log('[App] 已有工作项，跳过默认数据初始化')
      return
    }
    
    initDefaultItems()
    ensureDefaultMappings()
  }, [initDefaultItems, ensureDefaultMappings, activeTask, workItems])
  
  // 自动保存功能（防抖）- 修复竞态条件
  useEffect(() => {
    // 只在有活动项目且启用了自动保存时执行
    if (!activeTask?.path || !settings.autoSave) {
      return
    }
    
    // 序列化当前 workItems 和 seedance2Data 用于比较
    const currentWorkItemsJson = JSON.stringify(workItems)
    const currentSeedance2DataJson = JSON.stringify(seedance2Data)
    
    // 如果数据没有变化，不保存
    if (currentWorkItemsJson === lastSavedWorkItemsRef.current && 
        currentSeedance2DataJson === lastSavedSeedance2DataRef.current) {
      return
    }
    
    // 清除之前的定时器
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }
    
    // 延迟 2 秒后自动保存（防抖）
    // 使用闭包捕获当前数据快照，确保保存的是触发时的数据
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('[App] 自动保存项目...')
        // 直接从 store 获取最新状态，避免闭包问题
        const { saveCurrentProject: doSave, activeTask: currentTask } = useAppStore.getState()
        
        // 检查是否还有活动项目（可能用户已经切换或返回主页）
        if (!currentTask?.path) {
          console.log('[App] 自动保存跳过：没有活动项目')
          return
        }
        
        const success = await doSave()
        if (success) {
          console.log('[App] 自动保存成功')
          // 更新最后保存的数据标记
          lastSavedWorkItemsRef.current = currentWorkItemsJson
          lastSavedSeedance2DataRef.current = currentSeedance2DataJson
        } else {
          console.warn('[App] 自动保存失败')
        }
      } catch (err) {
        console.error('[App] 自动保存出错:', err)
      }
    }, 2000)
    
    // 清理函数
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [workItems, seedance2Data, activeTask?.path, settings.autoSave])

  // 定期自动保存（每2分钟强制保存一次）- 修复竞态条件
  useEffect(() => {
    if (!activeTask?.path || !settings.autoSave) {
      return
    }

    const intervalId = setInterval(async () => {
      try {
        console.log('[App] 定期自动保存...')
        // 直接从 store 获取最新状态和保存函数，避免闭包问题
        const { saveCurrentProject: doSave, activeTask: currentTask, workItems: currentWorkItems, seedance2Data: currentSeedance2Data } = useAppStore.getState()
        
        // 检查是否还有活动项目
        if (!currentTask?.path) {
          console.log('[App] 定期自动保存跳过：没有活动项目')
          return
        }
        
        const success = await doSave()
        if (success) {
          console.log('[App] 定期自动保存成功')
          lastSavedWorkItemsRef.current = JSON.stringify(currentWorkItems)
          lastSavedSeedance2DataRef.current = JSON.stringify(currentSeedance2Data)
        }
      } catch (err) {
        console.error('[App] 定期自动保存出错:', err)
      }
    }, 120000) // 每2分钟保存一次

    return () => {
      clearInterval(intervalId)
    }
  }, [activeTask?.path, settings.autoSave])

  // 窗口关闭监听和保存保护
  useEffect(() => {
    let isClosing = false
    let shouldCloseAfterSave = false

    const setupCloseListener = async () => {
      try {
        const mainWindow = getCurrentWindow()
        
        const unlisten = await mainWindow.onCloseRequested(async (event) => {
          const state = useAppStore.getState()
          
          // 如果已经在关闭过程中且保存完成，直接关闭
          if (isClosing && shouldCloseAfterSave) {
            return
          }

          // 如果正在保存中，阻止关闭但不做其他操作
          if (isClosing) {
            event.preventDefault()
            console.log('[App] 正在保存中，请稍候...')
            return
          }

          // 如果在首页且没有打开项目，直接关闭
          if (showHomeRef.current || !state.activeTask?.path) {
            console.log('[App] 无需保存，直接关闭窗口')
            return
          }

          // 阻止默认关闭，先保存项目
          event.preventDefault()
          isClosing = true
          console.log('[App] 窗口关闭，正在保存项目...')

          try {
            // 保存项目
            if (autoSaveTimeoutRef.current) {
              clearTimeout(autoSaveTimeoutRef.current)
              autoSaveTimeoutRef.current = null
            }
            
            const success = await state.saveProjectImmediately()
            
            if (success) {
              console.log('[App] 项目已保存，准备关闭窗口')
              shouldCloseAfterSave = true
              addToast({
                type: 'success',
                title: '保存成功',
                message: '项目数据已保存，正在关闭...',
                duration: 1500,
              })
            } else {
              console.error('[App] 保存项目失败')
              addToast({
                type: 'error',
                title: '保存失败',
                message: '项目保存失败，请检查磁盘空间或文件权限',
                duration: 5000,
              })
              isClosing = false
              return
            }
          } catch (err) {
            console.error('[App] 退出时处理失败:', err)
          }
          
          shouldCloseAfterSave = true
          isClosing = false
          mainWindow.destroy()
        })

        return unlisten
      } catch (err) {
        console.error('[App] 设置关闭监听器失败:', err)
        return () => {}
      }
    }

    const cleanup = setupCloseListener()
    
    return () => {
      cleanup.then(fn => fn())
    }
  }, [])

  // 启动时自动恢复上次的项目数据
  useEffect(() => {
    const restoreLastProject = async () => {
      const state = useAppStore.getState()
      if (state.activeTask?.path && state.workItems.length <= 4) {
        // activeTask 有值但 workItems 是初始状态（只有默认的4个空项），说明需要从文件恢复
        try {
          const projectData = await state.loadProjectData(state.activeTask.path)
          if (projectData && projectData.workItems.length > 0) {
            state.restoreProjectData(projectData)
            console.log('[App] 启动时自动恢复项目:', state.activeTask.name)

            // 修复丢失的视频文件引用
            try {
              const { scanVideoDirectory, videoFileExists } = await import('./utils/videoScanner')
              const currentItems = useAppStore.getState().workItems
              const videoItems = currentItems.filter(item => item.type === 'video')
              const brokenVideoItems = []

              for (const item of videoItems) {
                if (item.generatedVideo?.url) {
                  const fileOk = await videoFileExists(item.generatedVideo.url)
                  if (!fileOk) brokenVideoItems.push(item)
                }
              }

              if (brokenVideoItems.length > 0) {
                console.log(`[App] 发现 ${brokenVideoItems.length} 个视频文件引用丢失，尝试修复...`)
                const shotVideos = await scanVideoDirectory(state.activeTask.path)
                const updates: Array<{ id: string; updates: Record<string, unknown> }> = []

                for (const item of brokenVideoItems) {
                  const match = shotVideos.find(v => String(v.shotNumber) === String(item.shotNumber))
                  if (match) {
                    updates.push({
                      id: item.id,
                      updates: {
                        generatedVideo: {
                          ...item.generatedVideo!,
                          url: match.path,
                        },
                      },
                    })
                  }
                }

                if (updates.length > 0) {
                  useAppStore.getState().batchUpdateWorkItems(updates)
                  console.log(`[App] 已修复 ${updates.length} 个视频文件引用`)
                }
              }
            } catch (fixErr) {
              console.warn('[App] 视频文件修复失败:', fixErr)
            }
          }
        } catch (err) {
          console.error('[App] 启动时恢复项目失败:', err)
        }
      }
    }
    restoreLastProject()
  }, [])

  // 定时自动保存（每30秒）
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      const state = useAppStore.getState()
      if (state.activeTask?.path && state.workItems.length > 0) {
        state.saveCurrentProject().catch(err => {
          console.error('[App] 自动保存失败:', err)
        })
      }
    }, 30000)

    return () => clearInterval(autoSaveInterval)
  }, [])

  // 监听右键打开项目文件夹事件（从 Rust 端传来）
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setup = async () => {
      unlisten = await listen<string>('open-project-folder', async (event) => {
        const folderPath = event.payload
        console.log('[App] 收到打开项目文件夹事件:', folderPath)

        try {
          const fs = await import('@tauri-apps/plugin-fs')
          const projectFile = `${folderPath}\\project_data.json`
          const hasProject = await fs.exists(projectFile)

          if (!hasProject) {
            addToast({ type: 'error', title: '无效的项目文件夹', message: '未找到项目数据文件' })
            return
          }

          const folderName = folderPath.split(/[/\\]/).pop() || '未命名项目'
          const existingTask = tasks.find(t => t.path === folderPath)
          const task = existingTask || { name: folderName, path: folderPath, createdAt: Date.now() }

          if (!existingTask) {
            addTask(task)
          }

          if (activeTask?.path) {
            await saveProjectImmediately?.().catch(() => {})
          }

          clearWorkItems()
          setActiveTask(task)

          const projectData = await loadProjectData(task.path)
          if (projectData && projectData.workItems.length > 0) {
            restoreProjectData(projectData)
            console.log('[App] 右键打开项目:', task.name)
          } else {
            initDefaultItems()
          }

          setShowHome(false)
          addToast({ type: 'success', title: `已打开项目: ${folderName}` })
        } catch (err) {
          console.error('[App] 打开项目失败:', err)
          addToast({ type: 'error', title: '打开项目失败' })
        }
      })
    }

    setup()
    return () => { unlisten?.() }
  }, [tasks, activeTask, addTask, setActiveTask, clearWorkItems, loadProjectData, restoreProjectData, initDefaultItems, saveProjectImmediately, addToast])

  useEffect(() => {
    if (user?.account && !hasRefreshedUser.current) {
      hasRefreshedUser.current = true
      setTimeout(() => {
        console.log('[App] 用户已登录，后台刷新用户信息...')
        refreshUserInfo().catch(err => {
          console.error('[App] 刷新用户信息失败:', err)
        })
      }, 100)
    }
  }, [user?.account, refreshUserInfo])

  useEffect(() => {
    if (activeTask?.path) {
      notificationHistoryService.init(activeTask.path)
    }
  }, [activeTask?.path])

  useEffect(() => {
    if (settings.demoMode) {
      taskQueueManager.setMaxConcurrent(settings.maxConcurrent)
      return
    }

    if ((imageApiProvider === 'runninghub' || videoApiProvider === 'runninghub') && apiConfigs.runninghub) {
      taskQueueManager.setService(apiConfigs.runninghub)
      taskQueueManager.setMaxConcurrent(settings.maxConcurrent)
    }
  }, [imageApiProvider, videoApiProvider, apiConfigs.runninghub, settings.maxConcurrent, settings.demoMode])

  useEffect(() => {
    const applyTheme = (themeValue: string) => {
      if (themeValue === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', themeValue)
      }
    }

    applyTheme(theme)

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme('system')
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  const currentApiProvider = useMemo(() => {
    if (settings.demoMode) return '本地演示'
    return activeMode === 'video' ? videoApiProvider : imageApiProvider
  }, [activeMode, imageApiProvider, videoApiProvider, settings.demoMode])

  const handleModeChange = useCallback((mode: WorkType) => {
    setActiveMode(mode)
    setLastActiveMode(mode)
    
    const currentWorkItems = useAppStore.getState().workItems
    for (const item of currentWorkItems) {
      if (item.type === mode) {
        setActiveWorkId(item.id)
        return
      }
    }
    setActiveWorkId(null)
  }, [setActiveWorkId, setLastActiveMode])

  const handleCardClick = useCallback((id: string) => {
    setActiveWorkId(id)
  }, [setActiveWorkId])

  const handleOpenProject = useCallback(() => {
    setIsTransitioning(true)
    if (transitionRef.current) {
      clearTimeout(transitionRef.current)
    }
    transitionRef.current = setTimeout(() => {
      setShowHome(false)
      setIsTransitioning(false)
    }, 300)
  }, [])

  const handleGoHome = useCallback(async () => {
    // 如果有活动项目，先立即保存（不使用防抖延迟）
    if (activeTask?.path) {
      console.log('[App] 正在立即保存项目...')
      try {
        const success = await saveProjectImmediately()
        if (success) {
          console.log('[App] 项目保存成功')
          // 显示保存成功提示
          const { addToast } = useAppStore.getState()
          addToast({
            type: 'success',
            title: '项目已保存',
            message: `项目 "${activeTask.name}" 已成功保存`,
            duration: 2000,
          })
        } else {
          console.warn('[App] 项目保存失败')
          // 显示保存失败警告，询问用户是否继续
          const { addToast } = useAppStore.getState()
          addToast({
            type: 'warning',
            title: '保存失败',
            message: '项目保存失败，返回主页可能导致数据丢失',
            duration: 3000,
          })
          // 延迟一下让用户看到提示
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } catch (err) {
        console.error('[App] 保存项目时发生错误:', err)
        const { addToast } = useAppStore.getState()
        addToast({
          type: 'error',
          title: '保存出错',
          message: err instanceof Error ? err.message : '保存项目时发生未知错误',
          duration: 3000,
        })
        // 延迟一下让用户看到提示
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    setIsTransitioning(true)
    setShowHome(true)
    clearWorkItems()
    // 使用 skipSave 选项，因为上面已经手动保存过了
    await setActiveTask(null, { skipSave: true })
    
    requestAnimationFrame(() => {
      setIsTransitioning(false)
    })
  }, [clearWorkItems, setActiveTask, saveProjectImmediately, activeTask])

  const getStatusIcon = () => {
    if (processingCount > 0) return <Clock size={14} className={styles.statusProcessing} />
    if (errorCount > 0) return <AlertCircle size={14} className={styles.statusError} />
    if (completedCount > 0) return <CheckCircle size={14} className={styles.statusCompleted} />
    return null
  }

  const getStatusText = () => {
    if (processingCount > 0) return `${processingCount} 个任务处理中`
    if (errorCount > 0) return `${errorCount} 个任务失败`
    if (completedCount > 0) return `${completedCount} 个任务已完成`
    return '就绪'
  }

  return (
    <>
      <div 
        className={`${styles.homePageWrapper} ${isTransitioning && showHome ? styles.transitioning : ''}`}
        style={{ display: showHome ? 'block' : 'none' }}
      >
        <HomePage 
          onOpenProject={handleOpenProject}
          onOpenSettings={() => setShowSettings(true)}
        />
        <EulaModal 
          isOpen={showEula}
          onAccept={handleAcceptEula}
          onReject={handleRejectEula}
        />
      </div>

      <div 
        className={`${styles.app} ${isTransitioning && !showHome ? styles.transitioning : ''}`}
        style={{ display: showHome ? 'none' : 'flex' }}
      >
        <Sidebar activeMode={activeMode} onModeChange={handleModeChange} />

        <main className={styles.main} style={{ display: (activeMode === 'image' || activeMode === 'video') ? 'flex' : 'none' }}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.taskInfo}>
                <button className={styles.homeBtn} onClick={handleGoHome} title="返回首页">
                  <Home size={16} />
                </button>
                <h2>{activeTask ? activeTask.name : '未选择任务'}</h2>
                {activeItem && (
                  <span className={styles.shotBadge}>
                    镜头 #{activeItem.shotNumber}
                  </span>
                )}
              </div>
              <div className={styles.statusInfo}>
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </div>
            </div>
            <div className={styles.headerRight}>
              <div className={styles.apiIndicator}>
                当前API: <span className={styles.apiName}>{currentApiProvider.toUpperCase()}</span>
              </div>
              <ThemeToggle />
              <button 
                className={styles.headerBtn} 
                title="库"
                onClick={() => setShowLibraryManager(true)}
              >
                <Database size={18} />
              </button>
              <button 
                className={styles.headerBtn} 
                title="设置"
                onClick={() => setShowSettings(true)}
              >
                <Settings size={18} />
              </button>
              <button 
                className={styles.headerBtn} 
                title="提示词库"
                onClick={() => setShowPromptLibrary(true)}
              >
                <BookOpen size={18} />
              </button>
              <button 
                className={styles.headerBtn} 
                title="通知历史"
                onClick={() => setShowNotificationHistory(true)}
              >
                <History size={18} />
              </button>
            </div>
          </header>

          <div className={styles.content}>
            <div className={styles.leftPanel}>
              <ImportResultsButton />
              <BatchExport />
              <GlobalPrompt activeMode={activeMode as 'image' | 'video'} />
              <ExcelImporter />
              <FrameExtractor />
              <ViewAngleConverter />
            </div>

            <div className={styles.rightPanel}>
              <div className={styles.workArea}>
                <div className={styles.workList} style={{ display: activeMode === 'image' ? 'grid' : 'none' }}>
                  {imageItems.map((item) => (
                    <WorkCard
                      key={item.id}
                      item={item}
                      isActive={activeWorkId === item.id}
                      onClick={() => handleCardClick(item.id)}
                    />
                  ))}
                </div>
                <div className={styles.workList} style={{ display: activeMode === 'video' ? 'grid' : 'none' }}>
                  {videoItems.map((item) => (
                    <WorkCard
                      key={item.id}
                      item={item}
                      isActive={activeWorkId === item.id}
                      onClick={() => handleCardClick(item.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>

        <main className={styles.main} style={{ display: activeMode === 'lipsync' ? 'flex' : 'none' }}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.taskInfo}>
                <button className={styles.homeBtn} onClick={handleGoHome} title="返回首页">
                  <Home size={16} />
                </button>
                <h2>{activeTask ? activeTask.name : '未选择任务'} - 对口型</h2>
              </div>
              <div className={styles.statusInfo}>
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </div>
            </div>
            <div className={styles.headerRight}>
              <div className={styles.apiIndicator}>
                当前API: <span className={styles.apiName}>{activeItem?.lipsyncState?.lipsyncApiProvider === 'volcark' ? 'Seedance 2.0' : '即梦'}</span>
              </div>
              <ThemeToggle />
              <button 
                className={styles.headerBtn} 
                title="库"
                onClick={() => setShowLibraryManager(true)}
              >
                <Database size={18} />
              </button>
              <button 
                className={styles.headerBtn} 
                title="设置"
                onClick={() => setShowSettings(true)}
              >
                <Settings size={18} />
              </button>
              <button 
                className={styles.headerBtn} 
                title="提示词库"
                onClick={() => setShowPromptLibrary(true)}
              >
                <BookOpen size={18} />
              </button>
              <button 
                className={styles.headerBtn} 
                title="通知历史"
                onClick={() => setShowNotificationHistory(true)}
              >
                <History size={18} />
              </button>
            </div>
          </header>

          <div className={styles.content}>
            <div className={styles.leftPanel}>
              <LipSyncPanel />
            </div>

            <div className={styles.rightPanel}>
              <div className={styles.workArea}>
                <div className={styles.workList}>
                  {lipsyncItems.map((item) => (
                    <LipSyncWorkCard
                      key={item.id}
                      item={item}
                      isActive={activeWorkId === item.id}
                      onClick={() => handleCardClick(item.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>

        <main className={styles.main} style={{ display: activeMode === 'voice' ? 'flex' : 'none' }}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.taskInfo}>
                <button className={styles.homeBtn} onClick={handleGoHome} title="返回首页">
                  <Home size={16} />
                </button>
                <h2>{activeTask ? activeTask.name : '未选择任务'} - 配音</h2>
              </div>
              <div className={styles.statusInfo}>
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </div>
            </div>
            <div className={styles.headerRight}>
              <div className={styles.apiIndicator}>
                当前API: <span className={styles.apiName}>MiniMax TTS</span>
              </div>
              <ThemeToggle />
              <button 
                className={styles.headerBtn} 
                title="库"
                onClick={() => setShowLibraryManager(true)}
              >
                <Database size={18} />
              </button>
              <button 
                className={styles.headerBtn} 
                title="设置"
                onClick={() => setShowSettings(true)}
              >
                <Settings size={18} />
              </button>
            </div>
          </header>

          <div className={styles.content}>
            <div className={styles.leftPanel}>
              <VoiceCharacterPanel />
            </div>

            <div className={styles.rightPanel}>
              <div className={styles.workArea}>
                <div className={styles.workList}>
                  {voiceItems.map((item) => (
                    <VoiceWorkCard
                      key={item.id}
                      item={item}
                      isActive={activeWorkId === item.id}
                      onClick={() => handleCardClick(item.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>

        <main className={styles.main} style={{ display: activeMode === 'seedance2' ? 'flex' : 'none' }}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.taskInfo}>
                <button className={styles.homeBtn} onClick={handleGoHome} title="返回首页">
                  <Home size={16} />
                </button>
                <h2>{activeTask ? activeTask.name : '未选择任务'} - Seedance2.0</h2>
              </div>
              <div className={styles.statusInfo}>
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </div>
            </div>
            <div className={styles.headerRight}>
              <ThemeToggle />
              <button 
                className={styles.headerBtn} 
                title="库"
                onClick={() => setShowLibraryManager(true)}
              >
                <Database size={18} />
              </button>
              <button 
                className={styles.headerBtn} 
                title="设置"
                onClick={() => setShowSettings(true)}
              >
                <Settings size={18} />
              </button>
            </div>
          </header>

          <div className={styles.content}>
            <div className={styles.fullPanel}>
              <Seedance2Panel />
            </div>
          </div>
        </main>

        <SettingsPanel 
          isOpen={showSettings} 
          onClose={() => setShowSettings(false)} 
        />
        
        <TaskDialog
          isOpen={showTaskDialog}
          onClose={() => setShowTaskDialog(false)}
        />

        <TaskSelector
          isOpen={showTaskSelector}
          onClose={() => setShowTaskSelector(false)}
        />

        <ShotNavigator />

        <PromptLibrary 
          isOpen={showPromptLibrary}
          onClose={() => setShowPromptLibrary(false)}
        />

        <LibraryManager
          isOpen={showLibraryManager}
          onClose={() => setShowLibraryManager(false)}
        />

        <NotificationHistory 
          isOpen={showNotificationHistory}
          onClose={() => setShowNotificationHistory(false)}
        />
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  )
}

export default App
