import { useState } from 'react'
import { Download, Share2, ZoomIn, ZoomOut, RotateCw, Trash2, Copy, Check } from 'lucide-react'
import type { GeneratedImage } from '../../types'
import styles from './ResultDisplay.module.css'

interface ResultDisplayProps {
  images: GeneratedImage[]
  onClear: () => void
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ images, onClear }) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [copied, setCopied] = useState(false)

  const selectedImage = images[selectedIndex]

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5))
  const handleResetZoom = () => setZoom(1)

  const handleDownload = async () => {
    if (!selectedImage) return
    
    const link = document.createElement('a')
    link.href = selectedImage.url
    link.download = `xuyan-ai-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCopy = async () => {
    if (!selectedImage) return
    
    try {
      const response = await fetch(selectedImage.url)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleShare = async () => {
    if (!selectedImage) return
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: '旭言AI生成的图片',
          text: selectedImage.prompt,
        })
      } catch (err) {
        console.error('Share failed:', err)
      }
    }
  }

  if (images.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3>生成结果</h3>
        </div>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <RotateCw size={48} />
          </div>
          <p>暂无生成结果</p>
          <span>输入提示词并点击生成按钮开始创作</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>生成结果</h3>
        <span className={styles.count}>{images.length} 张</span>
      </div>

      <div className={styles.previewArea}>
        <div className={styles.imageWrapper}>
          <img
            src={selectedImage.url}
            alt="Generated"
            style={{ transform: `scale(${zoom})` }}
            className={styles.previewImage}
          />
        </div>

        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={handleZoomOut} title="缩小">
            <ZoomOut size={18} />
          </button>
          <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
          <button className={styles.toolBtn} onClick={handleZoomIn} title="放大">
            <ZoomIn size={18} />
          </button>
          <button className={styles.toolBtn} onClick={handleResetZoom} title="重置">
            <RotateCw size={18} />
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={handleDownload}>
          <Download size={16} />
          保存
        </button>
        <button className={styles.actionBtn} onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? '已复制' : '复制'}
        </button>
        <button className={styles.actionBtn} onClick={handleShare}>
          <Share2 size={16} />
          分享
        </button>
        <button className={styles.actionBtn} onClick={onClear}>
          <Trash2 size={16} />
          清空
        </button>
      </div>

      {images.length > 1 && (
        <div className={styles.thumbnailList}>
          {images.map((img, idx) => (
            <button
              key={img.id}
              className={`${styles.thumbnail} ${idx === selectedIndex ? styles.thumbnailActive : ''}`}
              onClick={() => setSelectedIndex(idx)}
            >
              <img src={img.url} alt={`Result ${idx + 1}`} />
            </button>
          ))}
        </div>
      )}

      {selectedImage && (
        <div className={styles.info}>
          <p className={styles.prompt}>{selectedImage.prompt.slice(0, 100)}...</p>
          <span className={styles.timestamp}>
            {new Date(selectedImage.timestamp).toLocaleString('zh-CN')}
          </span>
        </div>
      )}
    </div>
  )
}

export default ResultDisplay
