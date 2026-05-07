import { Play, Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import styles from './ActionPanel.module.css'

interface ActionPanelProps {
  prompt: string
  referenceImages: Array<{ preview: string }>
  isGenerating: boolean
  generationStatus: 'idle' | 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  message: string
  errorMessage?: string
  onGenerate: () => void
}

const ActionPanel: React.FC<ActionPanelProps> = ({
  prompt,
  referenceImages,
  isGenerating,
  generationStatus,
  progress,
  message,
  errorMessage,
  onGenerate,
}) => {
  const canGenerate = prompt.trim().length > 0 || referenceImages.length > 0

  const getStatusIcon = () => {
    switch (generationStatus) {
      case 'pending':
      case 'processing':
        return <Loader2 size={20} className={styles.spin} />
      case 'completed':
        return <CheckCircle size={20} />
      case 'error':
        return <AlertCircle size={20} />
      default:
        return <Play size={20} />
    }
  }

  const getStatusText = () => {
    switch (generationStatus) {
      case 'pending':
        return '排队中...'
      case 'processing':
        return message
      case 'completed':
        return '生成完成'
      case 'error':
        return errorMessage || '生成失败'
      default:
        return '开始生成'
    }
  }

  return (
    <div className={styles.container}>
      <button
        className={`${styles.generateBtn} ${isGenerating ? styles.generating : ''} ${!canGenerate ? styles.disabled : ''}`}
        onClick={onGenerate}
        disabled={!canGenerate || isGenerating}
      >
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </button>

      {generationStatus !== 'idle' && (
        <div className={`${styles.statusBar} ${styles[generationStatus]}`}>
          {generationStatus === 'processing' && (
            <>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={styles.progressText}>{progress}%</span>
            </>
          )}
          {generationStatus === 'pending' && (
            <div className={styles.pendingInfo}>
              <Clock size={14} />
              <span>等待处理...</span>
            </div>
          )}
          {generationStatus === 'completed' && (
            <div className={styles.completedInfo}>
              <CheckCircle size={14} />
              <span>图像已生成</span>
            </div>
          )}
          {generationStatus === 'error' && (
            <div className={styles.errorInfo}>
              <AlertCircle size={14} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.info}>
        <span>提示词: {prompt.length} 字</span>
        <span>参考图: {referenceImages.length}/6 张</span>
      </div>
    </div>
  )
}

export default ActionPanel
