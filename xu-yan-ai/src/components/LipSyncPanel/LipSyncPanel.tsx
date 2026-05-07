import React from 'react'
import { Mic, Upload, Settings, Info } from 'lucide-react'
import styles from './LipSyncPanel.module.css'

const LipSyncPanel: React.FC = () => {
  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Mic size={16} />
          <span>对口型功能</span>
        </div>
        <div className={styles.infoBox}>
          <Info size={14} />
          <p>对口型功能使用即梦API，让图片中的人物根据音频说话。</p>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Upload size={16} />
          <span>使用说明</span>
        </div>
        <ol className={styles.steps}>
          <li>导入Excel表格创建镜头</li>
          <li>为每个镜头上传首帧图片</li>
          <li>上传驱动音频文件</li>
          <li>点击"检测人物"识别主体</li>
          <li>选择要说话的人物</li>
          <li>点击"生成视频"</li>
        </ol>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Settings size={16} />
          <span>参数说明</span>
        </div>
        <div className={styles.paramList}>
          <div className={styles.paramItem}>
            <span className={styles.paramLabel}>首帧图片</span>
            <span className={styles.paramDesc}>人物正面清晰照片效果最佳</span>
          </div>
          <div className={styles.paramItem}>
            <span className={styles.paramLabel}>驱动音频</span>
            <span className={styles.paramDesc}>时长不超过60秒，建议15秒内</span>
          </div>
          <div className={styles.paramItem}>
            <span className={styles.paramLabel}>人物选择</span>
            <span className={styles.paramDesc}>可选择特定人物或自动选择</span>
          </div>
          <div className={styles.paramItem}>
            <span className={styles.paramLabel}>提示词</span>
            <span className={styles.paramDesc}>控制表情、动作、风格等</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>API配置</span>
        </div>
        <div className={styles.apiInfo}>
          <p>支持 <strong>即梦 API</strong>（对口型）和 <strong>Seedance 2.0</strong>（图生视频/对口型）</p>
          <p className={styles.apiHint}>即梦需配置 Access Key 和 Secret Key；Seedance 需配置火山方舟 API Key</p>
        </div>
      </div>
    </div>
  )
}

export default LipSyncPanel
