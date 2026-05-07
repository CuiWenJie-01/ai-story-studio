import { useState } from 'react'
import { X, FolderPlus, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { mkdir } from '@tauri-apps/plugin-fs'
import { useAppStore } from '../../store/appStore'
import type { TaskFolder } from '../../types'
import styles from './TaskDialog.module.css'

interface TaskDialogProps {
  isOpen: boolean
  onClose: () => void
}

const TaskDialog: React.FC<TaskDialogProps> = ({ isOpen, onClose }) => {
  const { settings, addTask, setActiveTask } = useAppStore()
  const [taskName, setTaskName] = useState('')
  const [status, setStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const subFolders = ['Character image', 'Image', 'Video', 'Voice', '角色库']

  const handleCreate = async () => {
    if (!taskName.trim()) {
      setErrorMessage('请输入任务名称')
      return
    }

    if (!settings.savePath) {
      setErrorMessage('请先在设置中配置保存路径')
      return
    }

    setStatus('creating')
    setErrorMessage('')

    try {
      const basePath = settings.savePath.replace(/\\/g, '/')
      const taskPath = `${basePath}/${taskName.trim()}`

      console.log('创建任务测试 - 保存路径:', basePath)
      console.log('创建任务测试 - 任务路径:', taskPath)

      console.log('开始创建任务文件夹...')
      try {
        await mkdir(taskPath, { recursive: true })
        console.log('任务文件夹创建完成')
      } catch (err) {
        console.error('创建任务文件夹失败:', err)
        throw err
      }

      for (const subFolder of subFolders) {
        const subFolderPath = `${taskPath}/${subFolder}`.replace(/\\/g, '/')
        console.log('创建子文件夹:', subFolderPath)
        try {
          await mkdir(subFolderPath, { recursive: true })
          console.log('子文件夹创建完成:', subFolderPath)
        } catch (err) {
          console.error('创建子文件夹失败:', subFolderPath, err)
          throw err
        }
      }

      const newTask: TaskFolder = {
        name: taskName.trim(),
        path: taskPath,
        createdAt: Date.now(),
      }
      
      addTask(newTask)
      setActiveTask(newTask)

      setStatus('success')
      setTimeout(() => {
        setStatus('idle')
        setTaskName('')
        onClose()
      }, 1500)
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '创建文件夹失败')
    }
  }

  const handleClose = () => {
    if (status === 'creating') return
    setStatus('idle')
    setTaskName('')
    setErrorMessage('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>创建新任务</h2>
          <button className={styles.closeBtn} onClick={handleClose} disabled={status === 'creating'}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.field}>
            <label>任务名称</label>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="输入任务名称"
              disabled={status === 'creating'}
              autoFocus
            />
          </div>

          <div className={styles.preview}>
            <h4>将创建以下文件夹结构：</h4>
            <div className={styles.folderTree}>
              <div className={styles.folderItem}>
                <FolderPlus size={14} />
                <span>{taskName.trim() || '任务名称'}/</span>
              </div>
              {subFolders.map((folder) => (
                <div key={folder} className={styles.subFolderItem}>
                  <FolderPlus size={12} />
                  <span>{folder}/</span>
                </div>
              ))}
            </div>
          </div>

          {errorMessage && (
            <div className={styles.error}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {status === 'success' && (
            <div className={styles.success}>
              <CheckCircle size={16} />
              <span>任务创建成功！</span>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button 
            className={styles.cancelBtn} 
            onClick={handleClose}
            disabled={status === 'creating'}
          >
            取消
          </button>
          <button
            className={`${styles.createBtn} ${status === 'creating' ? styles.creating : ''}`}
            onClick={handleCreate}
            disabled={status === 'creating' || !taskName.trim()}
          >
            {status === 'creating' ? (
              <>
                <Loader2 size={16} className={styles.spin} />
                创建中...
              </>
            ) : (
              <>
                <FolderPlus size={16} />
                创建任务
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TaskDialog
