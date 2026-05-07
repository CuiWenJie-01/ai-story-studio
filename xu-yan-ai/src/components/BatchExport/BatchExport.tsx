import { useState } from 'react'
import { Download } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../../store/appStore'
import styles from './BatchExport.module.css'

const BatchExport: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false)
  const activeTask = useAppStore(state => state.activeTask)
  const workItems = useAppStore(state => state.workItems)
  const addToast = useAppStore(state => state.addToast)

  const handleExport = async () => {
    if (!activeTask?.path || isExporting) return

    const targetDir = await open({ directory: true, title: '选择导出目录' })
    if (!targetDir) return

    setIsExporting(true)
    let imageCount = 0
    let videoCount = 0
    let failCount = 0

    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const { join } = await import('@tauri-apps/api/path')

      const imgExportDir = await join(targetDir as string, '图片')
      const vidExportDir = await join(targetDir as string, '视频')

      for (const item of workItems) {
        // Export latest image
        if (item.generatedImage?.url) {
          const srcPath = item.generatedImage.url
          try {
            if (await fs.exists(srcPath)) {
              await fs.mkdir(imgExportDir, { recursive: true })
              const ext = srcPath.split('.').pop() || 'png'
              const destPath = await join(imgExportDir, `镜头${item.shotNumber}_Image.${ext}`)
              await fs.copyFile(srcPath, destPath)
              imageCount++
            }
          } catch (err) {
            console.warn(`[BatchExport] 导出镜头${item.shotNumber}图片失败:`, err)
            failCount++
          }
        }

        // Export latest video
        if (item.generatedVideo?.url) {
          const srcPath = item.generatedVideo.url
          try {
            if (await fs.exists(srcPath)) {
              await fs.mkdir(vidExportDir, { recursive: true })
              const ext = srcPath.split('.').pop() || 'mp4'
              const destPath = await join(vidExportDir, `镜头${item.shotNumber}_Video.${ext}`)
              await fs.copyFile(srcPath, destPath)
              videoCount++
            }
          } catch (err) {
            console.warn(`[BatchExport] 导出镜头${item.shotNumber}视频失败:`, err)
            failCount++
          }
        }
      }

      if (imageCount + videoCount > 0) {
        const msg = [
          imageCount > 0 ? `图片 ${imageCount} 张` : '',
          videoCount > 0 ? `视频 ${videoCount} 个` : '',
          failCount > 0 ? `失败 ${failCount} 个` : '',
        ].filter(Boolean).join('，')
        addToast({ type: 'success', title: '导出完成', message: msg })
      } else {
        addToast({ type: 'error', title: '没有可导出的文件', message: '请先生成图片或视频' })
      }
    } catch (err) {
      console.error('[BatchExport] 导出失败:', err)
      addToast({ type: 'error', title: '导出失败' })
    } finally {
      setIsExporting(false)
    }
  }

  if (!activeTask) return null

  return (
    <button
      className={styles.exportBtn}
      onClick={handleExport}
      disabled={isExporting}
      title="批量导出每个镜头最新的图片和视频"
    >
      <Download size={16} />
      <span>{isExporting ? '导出中...' : '批量导出'}</span>
    </button>
  )
}

export default BatchExport
