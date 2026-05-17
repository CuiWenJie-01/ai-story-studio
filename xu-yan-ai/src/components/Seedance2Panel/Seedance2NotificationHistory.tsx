import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Trash2, Bell } from 'lucide-react'
import { notificationHistoryService, type NotificationRecord } from '../../services/notificationHistoryService'
import styles from './Seedance2NotificationHistory.module.css'

interface Seedance2NotificationHistoryProps {
  isOpen: boolean
  onClose: () => void
  basePath: string | null
}

const Seedance2NotificationHistory: React.FC<Seedance2NotificationHistoryProps> = ({ isOpen, onClose, basePath }) => {
  const [records, setRecords] = useState<NotificationRecord[]>([])

  useEffect(() => {
    if (isOpen && basePath) {
      notificationHistoryService.init(basePath).then(() => {
        setRecords(notificationHistoryService.getRecords())
      })
    }
  }, [isOpen, basePath])

  const handleClearAll = async () => {
    if (confirm('确定要清空所有通知记录吗？')) {
      await notificationHistoryService.clearRecords()
      setRecords([])
    }
  }

  const handleDelete = async (id: string) => {
    await notificationHistoryService.deleteRecord(id)
    setRecords(records.filter(r => r.id !== id))
  }

  const getIcon = (type: NotificationRecord['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle size={16} className={styles.iconSuccess} />
      case 'error':
        return <AlertCircle size={16} className={styles.iconError} />
      case 'warning':
        return <AlertTriangle size={16} className={styles.iconWarning} />
      default:
        return <Info size={16} className={styles.iconInfo} />
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Bell size={16} />
            <h3>生成通知</h3>
            {records.length > 0 && <span className={styles.badge}>{records.length}</span>}
          </div>
          <div className={styles.headerActions}>
            {records.length > 0 && (
              <button className={styles.clearBtn} onClick={handleClearAll} title="清空全部">
                <Trash2 size={14} />
                <span>清空</span>
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className={styles.content}>
          {records.length === 0 ? (
            <div className={styles.empty}>
              <Info size={28} />
              <p>暂无通知记录</p>
              <span>生成视频时的网络异常、成功/失败信息将记录在这里</span>
            </div>
          ) : (
            <div className={styles.list}>
              {records.map((record) => (
                <div key={record.id} className={`${styles.item} ${styles[record.type]}`}>
                  <div className={styles.itemIcon}>
                    {getIcon(record.type)}
                  </div>
                  <div className={styles.itemContent}>
                    <div className={styles.itemTitle}>{record.title}</div>
                    {record.message && (
                      <div className={styles.itemMessage}>{record.message}</div>
                    )}
                    {record.shotNumber && (
                      <div className={styles.itemShot}>镜头 #{record.shotNumber}</div>
                    )}
                  </div>
                  <div className={styles.itemMeta}>
                    <span className={styles.itemTime}>{formatTime(record.timestamp)}</span>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(record.id)}
                      title="删除"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span>最多保留 50 条记录</span>
          <span>当前 {records.length} 条</span>
        </div>
      </div>
    </div>
  )
}

export default Seedance2NotificationHistory
