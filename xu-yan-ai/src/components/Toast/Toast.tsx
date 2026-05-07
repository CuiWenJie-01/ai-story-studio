import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import styles from './Toast.module.css'

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number
  shotNumber?: string
}

interface ToastProps {
  toast: ToastMessage
  onRemove: (id: string) => void
}

const Toast: React.FC<ToastProps> = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false)
  const workItems = useAppStore(state => state.workItems)
  const setActiveWorkId = useAppStore(state => state.setActiveWorkId)

  useEffect(() => {
    const duration = toast.duration || 5000
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onRemove(toast.id), 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExiting(true)
    setTimeout(() => onRemove(toast.id), 300)
  }

  const handleClick = () => {
    if (toast.shotNumber) {
      const targetItem = workItems.find(item => 
        String(item.shotNumber) === String(toast.shotNumber)
      )
      
      if (targetItem) {
        setActiveWorkId(targetItem.id)
        
        setTimeout(() => {
          const element = document.querySelector(`[data-shot-number="${toast.shotNumber}"]`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      }
      
      setIsExiting(true)
      setTimeout(() => onRemove(toast.id), 300)
    }
  }

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle size={20} className={styles.iconSuccess} />
      case 'error':
        return <AlertCircle size={20} className={styles.iconError} />
      case 'warning':
        return <AlertTriangle size={20} className={styles.iconWarning} />
      default:
        return <Info size={20} className={styles.iconInfo} />
    }
  }

  return (
    <div 
      className={`${styles.toast} ${styles[toast.type]} ${isExiting ? styles.exiting : ''} ${toast.shotNumber ? styles.clickable : ''}`}
      onClick={handleClick}
      title={toast.shotNumber ? '点击跳转到镜头' : undefined}
    >
      <div className={styles.iconWrapper}>
        {getIcon()}
      </div>
      <div className={styles.content}>
        <div className={styles.title}>{toast.title}</div>
        {toast.message && <div className={styles.message}>{toast.message}</div>}
      </div>
      <button className={styles.closeBtn} onClick={handleClose}>
        <X size={16} />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastMessage[]
  onRemove: (id: string) => void
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null

  return (
    <div className={styles.container}>
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

export default Toast
