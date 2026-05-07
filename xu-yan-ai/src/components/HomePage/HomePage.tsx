import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { FolderOpen, Package, Settings, Plus, ChevronRight, Trash2, FolderPlus, AlertCircle, Palette, FileText, X, PlusCircle, RefreshCw, Pencil, Check, WifiOff, UserX, Lock } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { mkdir } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import SearchBox from '../SearchBox'
import { LoginModal, RegisterModal, ChangePasswordModal, UserDropdown, ActivateSoftwareModal, GenerateLicenseModal, UserManagementModal } from '../Auth'
import MaterialCard from '../MaterialCard'
import MaterialDetailModal from '../MaterialDetailModal'
import { authService } from '../../services/authService'
import type { SubjectMaterial, Changelog, ChangeItem } from '../../types'
import styles from './HomePage.module.css'

type NavItem = 'projects' | 'materials' | 'settings'

type ProjectStyle = 'ancient_realistic' | 'modern_urban' | 'anime_2d' | 'ai_cg' | 'ghibli' | 'miyazaki' | 'dark_epic_3d'

interface StyleOption {
  id: ProjectStyle
  name: string
  description: string
  preview?: string
}

const STYLE_OPTIONS: StyleOption[] = [
  { id: 'ancient_realistic', name: '古风写实风格', description: '中国古典美学，写实细腻的画风' },
  { id: 'modern_urban', name: '现代都市风', description: '现代都市背景，时尚写实风格' },
  { id: 'anime_2d', name: '2D动漫风格', description: '日系动漫风格，色彩鲜明' },
  { id: 'ai_cg', name: 'AICG风格', description: 'AI生成艺术风格，现代感强' },
  { id: 'ghibli', name: '吉卜力风格', description: '吉卜力工作室风格，温暖治愈' },
  { id: 'miyazaki', name: '宫崎骏风格', description: '宫崎骏动画风格，梦幻自然' },
  { id: 'dark_epic_3d', name: '国风3D暗黑史诗', description: '国风3D影视CG，暗黑史诗氛围' },
]

interface HomePageProps {
  onOpenProject: (task: { name: string; path: string; createdAt: number }) => void
  onOpenSettings: () => void
}

const HomePage: React.FC<HomePageProps> = ({ onOpenProject, onOpenSettings }) => {
  const tasks = useAppStore(state => state.tasks)
  const activeTask = useAppStore(state => state.activeTask)
  const setActiveTask = useAppStore(state => state.setActiveTask)
  const addTask = useAppStore(state => state.addTask)
  const removeTask = useAppStore(state => state.removeTask)
  const renameTask = useAppStore(state => state.renameTask)
  const scanAndLoadProjects = useAppStore(state => state.scanAndLoadProjects)
  const settings = useAppStore(state => state.settings)
  const updateSettings = useAppStore(state => state.updateSettings)
  const user = useAppStore(state => state.user)
  const setUser = useAppStore(state => state.setUser)
  const hasRemainingDays = useAppStore(state => state.hasRemainingDays)
  const addToast = useAppStore(state => state.addToast)
  const subjectMaterials = useAppStore(state => state.subjectMaterials)
  const syncSubjectMaterials = useAppStore(state => state.syncSubjectMaterials)
  const loadProjectData = useAppStore(state => state.loadProjectData)
  const restoreProjectData = useAppStore(state => state.restoreProjectData)
  const initDefaultItems = useAppStore(state => state.initDefaultItems)
  const [activeNav, setActiveNav] = useState<NavItem>('projects')
  const [searchQuery, setSearchQuery] = useState('')
  const [materialSearchQuery, setMaterialSearchQuery] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<ProjectStyle>('ancient_realistic')
  const [createStatus, setCreateStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [showActivateSoftwareModal, setShowActivateSoftwareModal] = useState(false)
  const [showGenerateLicenseModal, setShowGenerateLicenseModal] = useState(false)
  const [showUserManagementModal, setShowUserManagementModal] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<SubjectMaterial | null>(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [changelogs, setChangelogs] = useState<Changelog[]>([])
  const [loadingChangelogs, setLoadingChangelogs] = useState(false)
  const [changelogsLoaded, setChangelogsLoaded] = useState(false)
  const [showAddChangelog, setShowAddChangelog] = useState(false)
  const [newVersion, setNewVersion] = useState('')
  const [newChanges, setNewChanges] = useState<ChangeItem[]>([{ type: '新增', content: '' }])
  const [submittingChangelog, setSubmittingChangelog] = useState(false)
  const [editingProjectPath, setEditingProjectPath] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [checkError, setCheckError] = useState<'network' | 'user_not_found' | 'password_error' | null>(null)
  const hasCheckedRef = useRef(false)

  const subFolders = ['Character image', 'Image', 'Video', 'Voice', '角色库', '道具库', '场景库']

  // 启动时验证 - 快速检测数据库连接，检测后立即释放连接
  useEffect(() => {
    const verifyOnStartup = async () => {
      // 防止重复检查
      if (hasCheckedRef.current) return
      hasCheckedRef.current = true

      console.log('[HomePage] 启动验证开始...')

      // 第一步：快速检测数据库连接（连接立即释放）
      try {
        const checkResult = await authService.quickCheckConnection()
        if (!checkResult.success) {
          console.error('[HomePage] 数据库连接失败:', checkResult.message)
          setCheckError('network')
          setIsChecking(false)
          return
        }
        console.log('[HomePage] 数据库连接正常')
      } catch (error) {
        console.error('[HomePage] 数据库连接检测出错:', error)
        // 如果是 Tauri 连接错误，可能是开发环境在浏览器中运行
        if (error instanceof Error && error.message.includes('Failed to fetch')) {
          console.log('[HomePage] 检测到 Tauri 连接失败，可能是在浏览器中运行，跳过验证')
          setIsChecking(false)
          return
        }
        // 其他错误，禁止使用软件
        setCheckError('network')
        setIsChecking(false)
        return
      }

      // 第二步：如果有登录用户，验证用户状态（包括检查密码是否被修改）
      if (user?.account) {
        // 检查是否有存储的密码哈希
        if (!user.password_hash) {
          console.error('[HomePage] 用户没有存储密码哈希，需要重新登录:', user.account)
          setUser(null)
          setCheckError('user_not_found')
          addToast({ type: 'error', title: '登录已过期', message: '请重新登录' })
          setIsChecking(false)
          return
        }
        
        try {
          const statusResult = await authService.verifyUserStatus(user.account, user.password_hash)
          
          // 如果用户无效（不存在或密码被修改），退出登录
          if (!statusResult.valid) {
            console.error('[HomePage] 当前登录用户无效:', user.account, statusResult.message)
            setUser(null)
            setCheckError('user_not_found')
            addToast({ type: 'error', title: '登录已过期', message: statusResult.message })
            setIsChecking(false)
            return
          }
          
          console.log('[HomePage] 用户验证通过')
        } catch (error) {
          console.error('[HomePage] 验证用户时出错:', error)
          // 如果是 Tauri 连接错误，可能是开发环境在浏览器中运行
          if (error instanceof Error && error.message.includes('Failed to fetch')) {
            console.log('[HomePage] 检测到 Tauri 连接失败，可能是在浏览器中运行，跳过验证')
            setIsChecking(false)
            return
          }
          setUser(null)
          setCheckError('user_not_found')
          addToast({ type: 'error', title: '验证失败', message: '请重新登录' })
          setIsChecking(false)
          return
        }
      }

      setIsChecking(false)
      console.log('[HomePage] 启动验证完成')
    }

    verifyOnStartup()
  }, [user?.account, setUser, addToast])

  // 关闭应用
  const handleCloseApp = useCallback(async () => {
    const mainWindow = await getCurrentWindow()
    await mainWindow.close()
  }, [])

  const projectNames = useMemo(() => tasks.map(t => t.name), [tasks])

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const lowerQuery = searchQuery.toLowerCase()
    return tasks.filter(task => 
      task.name.toLowerCase().includes(lowerQuery) ||
      task.path.toLowerCase().includes(lowerQuery)
    )
  }, [tasks, searchQuery])

  const filteredMaterials = useMemo(() => {
    if (!materialSearchQuery.trim()) return subjectMaterials
    const lowerQuery = materialSearchQuery.toLowerCase()
    return subjectMaterials.filter(material => 
      material.projectName.toLowerCase().includes(lowerQuery) ||
      material.projectPath.toLowerCase().includes(lowerQuery)
    )
  }, [subjectMaterials, materialSearchQuery])

  useEffect(() => {
    syncSubjectMaterials()
  }, [syncSubjectMaterials, tasks])

  useEffect(() => {
    const autoScanProjects = async () => {
      if (!settings.savePath) return
      
      const scanKey = `xuyan-scanned-${settings.savePath}`
      const hasScannedBefore = localStorage.getItem(scanKey)
      
      if (!hasScannedBefore) {
        setIsScanning(true)
        try {
          const result = await scanAndLoadProjects(settings.savePath)
          if (result.added > 0) {
            addToast({ type: 'success', title: `自动扫描完成`, message: `已导入 ${result.added} 个项目` })
          }
          localStorage.setItem(scanKey, 'true')
        } catch (err) {
          console.error('[HomePage] 自动扫描项目失败:', err)
        } finally {
          setIsScanning(false)
        }
      }
    }
    
    autoScanProjects()
  }, [settings.savePath, scanAndLoadProjects, addToast])

  const handleScanProjects = async (resetScan = false) => {
    if (!settings.savePath) {
      addToast({ type: 'error', title: '请先配置项目保存路径' })
      return
    }
    
    if (resetScan) {
      const scanKey = `xuyan-scanned-${settings.savePath}`
      localStorage.removeItem(scanKey)
      addToast({ type: 'info', title: '已重置扫描状态，下次启动将重新扫描' })
      return
    }
    
    setIsScanning(true)
    try {
      const result = await scanAndLoadProjects(settings.savePath)
      addToast({ 
        type: 'success', 
        title: '扫描完成', 
        message: `发现 ${result.total} 个有效项目，新增 ${result.added} 个项目` 
      })
    } catch (err) {
      addToast({ type: 'error', title: '扫描失败', message: String(err) })
    } finally {
      setIsScanning(false)
    }
  }

  const fetchChangelogs = useCallback(async (forceRefresh = false) => {
    if (changelogsLoaded && !forceRefresh) return
    
    setLoadingChangelogs(true)
    try {
      const response = await invoke<{ success: boolean; message: string; data: Changelog[] | null }>('tauri_get_changelogs')
      if (response.success && response.data) {
        setChangelogs(response.data)
        setChangelogsLoaded(true)
      }
    } catch (err) {
      console.error('获取更新日志失败:', err)
    } finally {
      setLoadingChangelogs(false)
    }
  }, [changelogsLoaded])

  const handleOpenChangelog = useCallback(() => {
    setShowChangelog(true)
    fetchChangelogs()
  }, [fetchChangelogs])

  const handleAddChangeItem = () => {
    setNewChanges([...newChanges, { type: '新增', content: '' }])
  }

  const handleRemoveChangeItem = (index: number) => {
    if (newChanges.length > 1) {
      setNewChanges(newChanges.filter((_, i) => i !== index))
    }
  }

  const handleChangeItemUpdate = (index: number, field: 'type' | 'content', value: string) => {
    const updated = [...newChanges]
    if (field === 'type') {
      updated[index] = { ...updated[index], type: value as ChangeItem['type'] }
    } else {
      updated[index] = { ...updated[index], content: value }
    }
    setNewChanges(updated)
  }

  const handleSubmitChangelog = async () => {
    if (!user?.is_admin) {
      addToast({ type: 'error', title: '权限不足', message: '只有管理员可以添加更新日志' })
      return
    }

    if (!newVersion.trim()) {
      addToast({ type: 'error', title: '请输入版本号' })
      return
    }

    const validChanges = newChanges.filter(c => c.content.trim())
    if (validChanges.length === 0) {
      addToast({ type: 'error', title: '请至少添加一条更新内容' })
      return
    }

    setSubmittingChangelog(true)
    try {
      const response = await invoke<{ success: boolean; message: string; data: Changelog | null }>(
        'tauri_add_changelog',
        {
          userId: user.id,
          version: newVersion.trim(),
          content: validChanges
        }
      )

      if (response.success) {
        addToast({ type: 'success', title: '添加成功' })
        fetchChangelogs(true)
        setShowAddChangelog(false)
        setNewVersion('')
        setNewChanges([{ type: '新增', content: '' }])
      } else {
        addToast({ type: 'error', title: '添加失败', message: response.message })
      }
    } catch (err) {
      addToast({ type: 'error', title: '添加失败', message: String(err) })
    } finally {
      setSubmittingChangelog(false)
    }
  }

  const handleDeleteChangelog = async (changelogId: number) => {
    if (!user?.is_admin) {
      addToast({ type: 'error', title: '权限不足', message: '只有管理员可以删除更新日志' })
      return
    }

    try {
      const response = await invoke<{ success: boolean; message: string }>(
        'tauri_delete_changelog',
        {
          userId: user.id,
          changelogId
        }
      )

      if (response.success) {
        addToast({ type: 'success', title: '删除成功' })
        fetchChangelogs(true)
      } else {
        addToast({ type: 'error', title: '删除失败', message: response.message })
      }
    } catch (err) {
      addToast({ type: 'error', title: '删除失败', message: String(err) })
    }
  }

  const handleCreateProject = useCallback(async () => {
    if (!user) {
      addToast({ type: 'error', title: '请先登录' })
      return
    }

    if (!hasRemainingDays()) {
      addToast({ type: 'error', title: '使用时间已到期', message: '请联系管理员进行续费操作' })
      return
    }

    // 检查软件是否已激活（非管理员需要）
    if (!user.is_admin) {
      const canUse = await useAppStore.getState().canUseSoftware()
      if (!canUse) {
        addToast({ type: 'error', title: '软件未激活', message: '请先激活本机软件才能使用' })
        return
      }
    }

    if (!newProjectName.trim()) {
      addToast({ type: 'error', title: '请输入项目名称' })
      return
    }

    if (!settings.savePath) {
      addToast({ type: 'error', title: '请先在设置中配置项目保存路径' })
      setActiveNav('settings')
      return
    }

    setCreateStatus('creating')

    try {
      const basePath = settings.savePath.replace(/\\/g, '/')
      const projectPath = `${basePath}/${newProjectName.trim()}`

      await mkdir(projectPath, { recursive: true })

      for (const subFolder of subFolders) {
        const subFolderPath = `${projectPath}/${subFolder}`.replace(/\\/g, '/')
        await mkdir(subFolderPath, { recursive: true })
      }

      const styleInfo = STYLE_OPTIONS.find(s => s.id === selectedStyle)
      const createdAt = Date.now()
      const newTask = {
        name: newProjectName.trim(),
        path: projectPath,
        createdAt,
        style: selectedStyle,
        styleName: styleInfo?.name,
      }

      try {
        const fs = await import('@tauri-apps/plugin-fs')
        const configPath = `${projectPath}/.project-config.json`
        const configContent = JSON.stringify({
          name: newProjectName.trim(),
          style: selectedStyle,
          styleName: styleInfo?.name,
          createdAt,
        }, null, 2)
        await fs.writeTextFile(configPath, configContent)
      } catch (configErr) {
        console.warn('[handleCreateProject] 保存配置文件失败:', configErr)
      }

      addTask(newTask)
      setCreateStatus('success')
      
      setTimeout(() => {
        setCreateStatus('idle')
        setNewProjectName('')
        setSelectedStyle('ancient_realistic')
        setShowCreateDialog(false)
        setActiveTask(newTask)
        onOpenProject(newTask)
      }, 1000)
    } catch (error) {
      setCreateStatus('error')
      addToast({ type: 'error', title: '创建项目失败', message: error instanceof Error ? error.message : '未知错误' })
    }
  }, [newProjectName, selectedStyle, settings.savePath, addTask, setActiveTask, onOpenProject])

  const handleOpenProject = async (task: typeof activeTask) => {
    console.log('[HomePage] handleOpenProject called, user:', user)
    if (!user) {
      console.log('[HomePage] No user, showing toast')
      addToast({ type: 'error', title: '请先登录' })
      return
    }

    if (!hasRemainingDays()) {
      console.log('[HomePage] No remaining days')
      addToast({ type: 'error', title: '使用时间已到期', message: '请联系管理员进行续费操作' })
      return
    }

    // 检查软件是否已激活（非管理员需要）
    if (!user.is_admin) {
      const canUse = await useAppStore.getState().canUseSoftware()
      if (!canUse) {
        addToast({ type: 'error', title: '软件未激活', message: '请先激活本机软件才能使用' })
        return
      }
    }

    if (task) {
      // 注意：setActiveTask 现在会在切换前自动保存当前项目
      // 需要等待保存完成后再加载新项目
      try {
        await setActiveTask(task)
        console.log(`[HomePage] 项目切换完成，开始加载数据: ${task.path}`)
      } catch (err) {
        console.error('[HomePage] 切换项目失败:', err)
        addToast({ type: 'error', title: '切换项目失败', message: '保存当前项目时出错' })
        return
      }
      
      try {
        console.log(`[HomePage] 开始加载项目数据: ${task.path}`)
        const projectData = await loadProjectData(task.path)
        
        if (projectData) {
          console.log(`[HomePage] 项目数据加载成功: ${task.name}, workItems数量: ${projectData.workItems?.length || 0}`)
          // 项目数据存在，恢复数据（即使 workItems 为空也是有效的）
          restoreProjectData(projectData)
          console.log('[HomePage] 项目数据已恢复:', task.name, `(${projectData.workItems?.length || 0} 个工作项)`)
        } else {
          // 项目数据文件不存在，初始化默认数据
          console.log('[HomePage] 项目数据文件不存在，初始化默认数据:', task.name)
          initDefaultItems()
        }
      } catch (err) {
        console.error('[HomePage] 加载项目数据失败:', err)
        // 加载失败时，尝试初始化默认数据
        initDefaultItems()
      }
      
      onOpenProject(task)
    }
  }

  const handleRemoveProject = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    removeTask(path)
  }

  const handleStartRename = (e: React.MouseEvent, task: typeof activeTask) => {
    e.stopPropagation()
    if (task) {
      setEditingProjectPath(task.path)
      setEditingProjectName(task.name)
    }
  }

  const handleRenameSubmit = async () => {
    if (!editingProjectPath || !editingProjectName.trim()) return

    const task = tasks.find(t => t.path === editingProjectPath)
    if (!task) return

    if (editingProjectName.trim() === task.name) {
      setEditingProjectPath(null)
      setEditingProjectName('')
      return
    }

    setIsRenaming(true)
    try {
      const oldPath = task.path
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'))
      const newPath = `${parentPath}/${editingProjectName.trim()}`

      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{ success: boolean; error?: string }>('tauri_rename_project_folder', {
        oldPath,
        newPath,
      })

      if (result.success) {
        renameTask(oldPath, editingProjectName.trim(), newPath)
        addToast({ type: 'success', title: '重命名成功' })
      } else {
        addToast({ type: 'error', title: '重命名失败', message: result.error || '未知错误' })
      }
    } catch (err) {
      addToast({ type: 'error', title: '重命名失败', message: String(err) })
    } finally {
      setIsRenaming(false)
      setEditingProjectPath(null)
      setEditingProjectName('')
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setEditingProjectPath(null)
      setEditingProjectName('')
    }
  }

  const handleMaterialClick = (material: SubjectMaterial) => {
    setSelectedMaterial(material)
    setShowMaterialModal(true)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // 渲染验证遮罩
  const renderCheckOverlay = () => {
    // 正在检查中
    if (isChecking) {
      return (
        <div className={styles.checkOverlay}>
          <div className={styles.checkContent}>
            <div className={`${styles.checkIcon} ${styles.spinning}`}>
              <RefreshCw size={32} />
            </div>
            <div className={styles.checkTitle}>正在验证...</div>
            <div className={styles.checkMessage}>正在检查网络连接和用户状态</div>
          </div>
        </div>
      )
    }

    // 网络/数据库连接错误
    if (checkError === 'network') {
      return (
        <div className={styles.checkOverlay}>
          <div className={styles.checkContent}>
            <div className={`${styles.checkIcon} ${styles.checkIconError}`}>
              <WifiOff size={32} />
            </div>
            <div className={styles.checkTitle}>无法连接到服务器</div>
            <div className={styles.checkMessage}>
              无法连接到数据库服务器，请检查网络连接后重试。<br />
              本软件需要联网才能使用。
            </div>
            <div className={styles.checkActions}>
              <button className={styles.checkBtn} onClick={() => window.location.reload()}>
                重试
              </button>
              <button className={styles.checkBtnSecondary} onClick={handleCloseApp}>
                退出
              </button>
            </div>
          </div>
        </div>
      )
    }

    // 用户不存在
    if (checkError === 'user_not_found') {
      return (
        <div className={styles.checkOverlay}>
          <div className={styles.checkContent}>
            <div className={`${styles.checkIcon} ${styles.checkIconError}`}>
              <UserX size={32} />
            </div>
            <div className={styles.checkTitle}>登录已过期</div>
            <div className={styles.checkMessage}>
              用户不存在或已被删除，请重新登录。<br />
              如需继续使用，请联系管理员。
            </div>
            <div className={styles.checkActions}>
              <button 
                className={styles.checkBtn} 
                onClick={() => {
                  setCheckError(null)
                  setShowLoginModal(true)
                }}
              >
                重新登录
              </button>
              <button className={styles.checkBtnSecondary} onClick={handleCloseApp}>
                退出
              </button>
            </div>
          </div>
        </div>
      )
    }

    // 密码错误
    if (checkError === 'password_error') {
      return (
        <div className={styles.checkOverlay}>
          <div className={styles.checkContent}>
            <div className={`${styles.checkIcon} ${styles.checkIconError}`}>
              <Lock size={32} />
            </div>
            <div className={styles.checkTitle}>密码已更改</div>
            <div className={styles.checkMessage}>
              密码已被修改，请使用新密码重新登录。
            </div>
            <div className={styles.checkActions}>
              <button 
                className={styles.checkBtn} 
                onClick={() => {
                  setCheckError(null)
                  setShowLoginModal(true)
                }}
              >
                重新登录
              </button>
              <button className={styles.checkBtnSecondary} onClick={handleCloseApp}>
                退出
              </button>
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <>
      {renderCheckOverlay()}
      <div className={styles.container}>
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <img src="/logo.png" alt="旭言AI" />
            </div>
            <span className={styles.logoText}>旭言AI</span>
          </div>

          <nav className={styles.nav}>
          <button
            className={`${styles.navItem} ${activeNav === 'projects' ? styles.navItemActive : ''}`}
            onClick={() => setActiveNav('projects')}
          >
            <FolderOpen size={18} />
            <span>项目</span>
            <ChevronRight size={14} className={styles.navArrow} />
          </button>
          <button
            className={`${styles.navItem} ${activeNav === 'materials' ? styles.navItemActive : ''}`}
            onClick={() => setActiveNav('materials')}
          >
            <Package size={18} />
            <span>主体素材</span>
            <ChevronRight size={14} className={styles.navArrow} />
          </button>
          <button
            className={`${styles.navItem} ${activeNav === 'settings' ? styles.navItemActive : ''}`}
            onClick={() => {
              setActiveNav('settings')
              onOpenSettings()
            }}
          >
            <Settings size={18} />
            <span>设置</span>
            <ChevronRight size={14} className={styles.navArrow} />
          </button>
        </nav>

        <div className={styles.userSection}>
          <UserDropdown
            onOpenLogin={() => setShowLoginModal(true)}
            onOpenChangePassword={() => setShowChangePasswordModal(true)}
            onOpenActivateSoftware={() => setShowActivateSoftwareModal(true)}
            onOpenGenerateLicense={() => setShowGenerateLicenseModal(true)}
            onOpenUserManagement={() => setShowUserManagementModal(true)}
          />
        </div>
      </aside>

      <main className={styles.main}>
        {activeNav === 'projects' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>我的项目</h2>
              <div className={styles.headerActions}>
                <button
                  className={styles.changelogBtn}
                  onClick={handleOpenChangelog}
                  title="更新日志"
                >
                  <FileText size={16} />
                  <span>更新日志</span>
                </button>
                <SearchBox
                  placeholder="搜索项目..."
                  items={projectNames}
                  onSearch={setSearchQuery}
                  onSelect={(name) => {
                    const task = tasks.find(t => t.name === name)
                    if (task) handleOpenProject(task)
                  }}
                  storageKey="project-search-history"
                />
                <button
                  className={styles.createBtn}
                  onClick={() => {
                    if (!settings.savePath) {
                      setActiveNav('settings')
                      onOpenSettings()
                      return
                    }
                    setShowCreateDialog(true)
                  }}
                >
                  <Plus size={16} />
                  <span>新建项目</span>
                </button>
              </div>
            </div>

            {!settings.savePath && (
              <div className={styles.warning}>
                <AlertCircle size={20} />
                <div className={styles.warningContent}>
                  <p className={styles.warningTitle}>请先配置项目保存路径</p>
                  <p className={styles.warningDesc}>
                    项目保存路径是创建和管理项目的必要配置。请前往「设置」模块配置您的项目保存路径，以便系统能够正确创建和保存您的项目文件。
                  </p>
                  <button
                    className={styles.warningBtn}
                    onClick={() => {
                      setActiveNav('settings')
                      onOpenSettings()
                    }}
                  >
                    前往设置
                  </button>
                </div>
              </div>
            )}

            {filteredProjects.length === 0 ? (
              <div className={styles.empty}>
                <FolderOpen size={64} className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>
                  {searchQuery ? '未找到匹配的项目' : '暂无项目'}
                </p>
                <p className={styles.emptyDesc}>
                  {searchQuery ? '请尝试其他搜索关键词' : '点击上方「新建项目」按钮创建您的第一个项目'}
                </p>
              </div>
            ) : (
              <div className={styles.projectGrid}>
                {filteredProjects.map((task) => (
                  <div
                    key={task.path}
                    className={`${styles.projectCard} ${activeTask?.path === task.path ? styles.projectCardActive : ''}`}
                    onClick={() => handleOpenProject(task)}
                  >
                    <div className={styles.projectIcon}>
                      <FolderOpen size={32} />
                    </div>
                    <div className={styles.projectInfo}>
                      {editingProjectPath === task.path ? (
                        <div className={styles.editNameContainer}>
                          <input
                            type="text"
                            value={editingProjectName}
                            onChange={(e) => setEditingProjectName(e.target.value)}
                            onKeyDown={handleRenameKeyDown}
                            onBlur={handleRenameSubmit}
                            autoFocus
                            disabled={isRenaming}
                            className={styles.editNameInput}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            className={styles.confirmRenameBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRenameSubmit()
                            }}
                            disabled={isRenaming}
                            title="确认重命名"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <h3 className={styles.projectName}>{task.name}</h3>
                      )}
                      <p className={styles.projectPath}>{task.path}</p>
                      <div className={styles.projectMeta}>
                        <p className={styles.projectDate}>{formatDate(task.createdAt)}</p>
                        {task.styleName && (
                          <span className={styles.styleTag}>{task.styleName}</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.projectActions}>
                      <button
                        className={styles.renameBtn}
                        onClick={(e) => handleStartRename(e, task)}
                        title="重命名项目"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className={styles.removeBtn}
                        onClick={(e) => handleRemoveProject(e, task.path)}
                        title="移除项目"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeNav === 'materials' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>主体素材</h2>
              <div className={styles.headerActions}>
                <SearchBox
                  placeholder="搜索素材..."
                  items={subjectMaterials.map(m => m.projectName)}
                  onSearch={setMaterialSearchQuery}
                  onSelect={(name) => {
                    const material = subjectMaterials.find(m => m.projectName === name)
                    if (material) handleMaterialClick(material)
                  }}
                  storageKey="material-search-history"
                />
              </div>
            </div>
            
            {filteredMaterials.length === 0 ? (
              <div className={styles.empty}>
                <Package size={64} className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>
                  {materialSearchQuery ? '未找到匹配的素材' : '暂无主体素材'}
                </p>
                <p className={styles.emptyDesc}>
                  {materialSearchQuery ? '请尝试其他搜索关键词' : '创建项目后会自动生成对应的主体素材'}
                </p>
              </div>
            ) : (
              <div className={styles.projectGrid}>
                {filteredMaterials.map((material) => (
                  <MaterialCard
                    key={material.id}
                    material={material}
                    onClick={() => handleMaterialClick(material)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeNav === 'settings' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>设置</h2>
            </div>
            <div className={styles.settingsContent}>
              <div className={styles.settingItem}>
                <label className={styles.settingLabel}>项目保存路径</label>
                <p className={styles.settingDesc}>
                  所有新建项目将保存在此路径下，每个项目会自动创建独立的文件夹
                </p>
                <div className={styles.pathInput}>
                  <input
                    type="text"
                    value={settings.savePath}
                    onChange={(e) => updateSettings({ savePath: e.target.value })}
                    placeholder="请选择或输入项目保存路径"
                  />
                  <button
                    className={styles.browseBtn}
                    onClick={async () => {
                      const { open } = await import('@tauri-apps/plugin-dialog')
                      const selected = await open({
                        directory: true,
                        multiple: false,
                        title: '选择项目保存路径',
                      })
                      if (selected && typeof selected === 'string') {
                        updateSettings({ savePath: selected })
                      }
                    }}
                  >
                    浏览...
                  </button>
                </div>
                {settings.savePath && (
                  <div className={styles.scanSection}>
                    <p className={styles.scanDesc}>
                      自动扫描路径下的项目文件夹（包含 Character image、Image、Video 文件夹的目录将被识别为项目）
                    </p>
                    <div className={styles.scanActions}>
                      <button
                        className={styles.scanBtn}
                        onClick={() => handleScanProjects(false)}
                        disabled={isScanning}
                      >
                        {isScanning ? (
                          <>
                            <RefreshCw size={16} className={styles.spinning} />
                            扫描中...
                          </>
                        ) : (
                          <>
                            <RefreshCw size={16} />
                            刷新项目列表
                          </>
                        )}
                      </button>
                      <button
                        className={styles.resetScanBtn}
                        onClick={() => handleScanProjects(true)}
                        title="重置后，下次启动软件将重新自动扫描"
                      >
                        重置自动扫描
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {showCreateDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowCreateDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <h3>创建新项目</h3>
              <button className={styles.dialogClose} onClick={() => setShowCreateDialog(false)}>
                ×
              </button>
            </div>
            <div className={styles.dialogContent}>
              <div className={styles.field}>
                <label>项目名称</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="输入项目名称"
                  autoFocus
                />
              </div>
              
              <div className={styles.field}>
                <label>
                  <Palette size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  项目风格
                </label>
                <div className={styles.styleGrid}>
                  {STYLE_OPTIONS.map((style) => (
                    <div
                      key={style.id}
                      className={`${styles.styleCard} ${selectedStyle === style.id ? styles.styleCardActive : ''}`}
                      onClick={() => setSelectedStyle(style.id)}
                    >
                      <div className={styles.styleName}>{style.name}</div>
                      <div className={styles.styleDesc}>{style.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.preview}>
                <h4>将创建以下文件夹结构：</h4>
                <div className={styles.folderTree}>
                  <div className={styles.folderItem}>
                    <FolderPlus size={14} />
                    <span>{newProjectName.trim() || '项目名称'}/</span>
                  </div>
                  {subFolders.map((folder) => (
                    <div key={folder} className={styles.subFolderItem}>
                      <FolderPlus size={12} />
                      <span>{folder}/</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.dialogActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowCreateDialog(false)}
                disabled={createStatus === 'creating'}
              >
                取消
              </button>
              <button
                className={styles.confirmBtn}
                onClick={handleCreateProject}
                disabled={createStatus === 'creating' || !newProjectName.trim()}
              >
                {createStatus === 'creating' ? '创建中...' : '创建项目'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onOpenRegister={() => {
          setShowLoginModal(false)
          setShowRegisterModal(true)
        }}
      />

      <RegisterModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onOpenLogin={() => {
          setShowRegisterModal(false)
          setShowLoginModal(true)
        }}
      />

      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        account={user?.account || ''}
      />

      <ActivateSoftwareModal
        isOpen={showActivateSoftwareModal}
        onClose={() => setShowActivateSoftwareModal(false)}
      />

      <GenerateLicenseModal
        isOpen={showGenerateLicenseModal}
        onClose={() => setShowGenerateLicenseModal(false)}
      />

      <UserManagementModal
        isOpen={showUserManagementModal}
        onClose={() => setShowUserManagementModal(false)}
      />

      <MaterialDetailModal
        isOpen={showMaterialModal}
        material={selectedMaterial}
        onClose={() => {
          setShowMaterialModal(false)
          setSelectedMaterial(null)
        }}
      />

      {showChangelog && (
        <div className={styles.changelogOverlay} onClick={() => setShowChangelog(false)}>
          <div className={styles.changelogPopup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.changelogHeader}>
              <h3>更新日志</h3>
              <div className={styles.changelogHeaderActions}>
                <button 
                  className={styles.refreshBtn}
                  onClick={() => fetchChangelogs(true)}
                  disabled={loadingChangelogs}
                  title="刷新"
                >
                  <RefreshCw size={16} className={loadingChangelogs ? styles.spinning : ''} />
                </button>
                {user?.is_admin && (
                  <button 
                    className={styles.addChangelogBtn}
                    onClick={() => {
                      setShowAddChangelog(true)
                      setShowChangelog(false)
                    }}
                  >
                    <PlusCircle size={16} />
                    <span>添加日志</span>
                  </button>
                )}
                <button className={styles.changelogClose} onClick={() => setShowChangelog(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className={styles.changelogContent}>
              {loadingChangelogs ? (
                <div className={styles.changelogLoading}>
                  <RefreshCw size={32} className={styles.spinning} />
                  <p>加载中...</p>
                </div>
              ) : changelogs.length === 0 ? (
                <div className={styles.changelogEmpty}>
                  <FileText size={48} />
                  <p>暂无更新日志</p>
                </div>
              ) : (
                changelogs.map((log) => (
                  <div key={log.id} className={styles.changelogVersion}>
                    <div className={styles.versionHeader}>
                      <span className={styles.versionNumber}>{log.version}</span>
                      <span className={styles.versionDate}>{log.created_at}</span>
                      {user?.is_admin && (
                        <button 
                          className={styles.deleteChangelogBtn}
                          onClick={() => handleDeleteChangelog(log.id)}
                          title="删除此日志"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <ul className={styles.changeList}>
                      {log.content.map((item, idx) => (
                        <li key={idx}>
                          <span className={`${styles.changeTag} ${styles[`changeTag${item.type}`] || ''}`}>
                            {item.type}
                          </span>
                          {item.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showAddChangelog && user?.is_admin && (
        <div className={styles.changelogOverlay} onClick={() => setShowAddChangelog(false)}>
          <div className={styles.changelogPopup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.changelogHeader}>
              <h3>添加更新日志</h3>
              <button className={styles.changelogClose} onClick={() => setShowAddChangelog(false)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.changelogContent}>
              <div className={styles.addField}>
                <label>版本号</label>
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="例如: v0.2.0"
                />
              </div>
              <div className={styles.addField}>
                <label>更新内容</label>
                {newChanges.map((change, index) => (
                  <div key={index} className={styles.changeItemRow}>
                    <select
                      value={change.type}
                      onChange={(e) => handleChangeItemUpdate(index, 'type', e.target.value)}
                    >
                      <option value="新增">新增</option>
                      <option value="优化">优化</option>
                      <option value="修复">修复</option>
                      <option value="移除">移除</option>
                    </select>
                    <input
                      type="text"
                      value={change.content}
                      onChange={(e) => handleChangeItemUpdate(index, 'content', e.target.value)}
                      placeholder="输入更新内容"
                    />
                    {newChanges.length > 1 && (
                      <button 
                        className={styles.removeChangeBtn}
                        onClick={() => handleRemoveChangeItem(index)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button className={styles.addChangeBtn} onClick={handleAddChangeItem}>
                  <Plus size={14} />
                  <span>添加条目</span>
                </button>
              </div>
            </div>
            <div className={styles.changelogActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowAddChangelog(false)}
                disabled={submittingChangelog}
              >
                取消
              </button>
              <button
                className={styles.confirmBtn}
                onClick={handleSubmitChangelog}
                disabled={submittingChangelog}
              >
                {submittingChangelog ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default HomePage
