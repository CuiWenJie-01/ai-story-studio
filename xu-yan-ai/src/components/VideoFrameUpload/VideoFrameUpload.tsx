import { useCallback, useRef } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import type { ReferenceImage } from '../../types'
import styles from './VideoFrameUpload.module.css'

interface VideoFrameUploadProps {
  firstFrame: ReferenceImage | null
  lastFrame: ReferenceImage | null
  onFirstFrameChange: (frame: ReferenceImage | null) => void
  onLastFrameChange: (frame: ReferenceImage | null) => void
}

interface FrameSlotProps {
  label: string
  frame: ReferenceImage | null
  onChange: (frame: ReferenceImage | null) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onDrop: (e: React.DragEvent, onChange: (frame: ReferenceImage | null) => void) => void
  onFileSelect: (files: FileList | null, onChange: (frame: ReferenceImage | null) => void) => void
}

const FrameSlot: React.FC<FrameSlotProps> = ({ 
  label, 
  frame, 
  onChange, 
  inputRef,
  onDrop,
  onFileSelect 
}) => (
  <div className={styles.frameSlot}>
    <span className={styles.label}>{label}</span>
    {frame ? (
      <div className={styles.previewContainer}>
        <img src={frame.preview} alt={frame.name} className={styles.preview} />
        <button
          className={styles.removeBtn}
          onClick={() => onChange(null)}
          title="移除"
        >
          <X size={14} />
        </button>
      </div>
    ) : (
      <div
        className={styles.uploadSlot}
        onClick={() => inputRef.current?.click()}
        onDrop={(e) => onDrop(e, onChange)}
        onDragOver={(e) => e.preventDefault()}
      >
        <Upload size={24} />
        <span>点击或拖拽上传</span>
      </div>
    )}
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      onChange={(e) => onFileSelect(e.target.files, onChange)}
      className={styles.hiddenInput}
    />
  </div>
)

const VideoFrameUpload: React.FC<VideoFrameUploadProps> = ({
  firstFrame,
  lastFrame,
  onFirstFrameChange,
  onLastFrameChange,
}) => {
  const firstInputRef = useRef<HTMLInputElement>(null)
  const lastInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((
    files: FileList | null,
    onChange: (frame: ReferenceImage | null) => void
  ) => {
    if (!files || files.length === 0) return
    
    const file = files[0]
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const newFrame: ReferenceImage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          preview: e.target?.result as string,
          name: file.name,
          order: 0,
        }
        onChange(newFrame)
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleDrop = useCallback((
    e: React.DragEvent,
    onChange: (frame: ReferenceImage | null) => void
  ) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files, onChange)
  }, [handleFileSelect])

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4>
          <ImageIcon size={16} />
          帧图片
        </h4>
      </div>
      <div className={styles.framesGrid}>
        <FrameSlot
          label="首帧"
          frame={firstFrame}
          onChange={onFirstFrameChange}
          inputRef={firstInputRef}
          onDrop={handleDrop}
          onFileSelect={handleFileSelect}
        />
        <FrameSlot
          label="尾帧"
          frame={lastFrame}
          onChange={onLastFrameChange}
          inputRef={lastInputRef}
          onDrop={handleDrop}
          onFileSelect={handleFileSelect}
        />
      </div>
    </div>
  )
}

export default VideoFrameUpload
