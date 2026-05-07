import { X, FolderOpen, Check, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import styles from './TaskSelector.module.css'

interface TaskSelectorProps {
  isOpen: boolean
  onClose: () => void
}

const TaskSelector: React.FC<TaskSelectorProps> = ({ isOpen, onClose }) => {
  const { tasks, activeTask, setActiveTask, removeTask, settings } = useAppStore()

  const handleSelectTask = (task: typeof activeTask) => {
    if (task) {
      setActiveTask(task)
      onClose()
    }
  }

  const handleRemoveTask = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    removeTask(path)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>选择任务</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {!settings.savePath && (
            <div className={styles.warning}>
              请先在设置中配置任务保存路径
            </div>
          )}

          {tasks.length === 0 ? (
            <div className={styles.empty}>
              <FolderOpen size={48} />
              <p>暂无已添加的任务</p>
              <span>请先创建新任务</span>
            </div>
          ) : (
            <div className={styles.taskList}>
              {tasks.map((task) => (
                <div
                  key={task.path}
                  className={`${styles.taskItem} ${activeTask?.path === task.path ? styles.active : ''}`}
                  onClick={() => handleSelectTask(task)}
                >
                  <div className={styles.taskInfo}>
                    <div className={styles.taskName}>
                      <FolderOpen size={16} />
                      <span>{task.name}</span>
                    </div>
                    <div className={styles.taskPath}>{task.path}</div>
                    <div className={styles.taskDate}>{formatDate(task.createdAt)}</div>
                  </div>
                  <div className={styles.taskActions}>
                    {activeTask?.path === task.path && (
                      <span className={styles.activeBadge}>
                        <Check size={14} />
                        当前
                      </span>
                    )}
                    <button
                      className={styles.removeBtn}
                      onClick={(e) => handleRemoveTask(e, task.path)}
                      title="移除任务"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.closeBtn} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default TaskSelector
