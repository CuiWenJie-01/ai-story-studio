import { X, Check, ExternalLink } from 'lucide-react'
import { open } from '@tauri-apps/plugin-shell'
import { useAppStore } from '../../store/appStore'
import { API_PROVIDERS, type ApiProvider } from '../../types'
import ApiIcon from './ApiIcon'
import styles from './ApiSelector.module.css'

interface ApiSelectorProps {
  isOpen: boolean
  onClose: () => void
  mode: 'image' | 'video'
}

const ApiSelectorPanel: React.FC<ApiSelectorProps> = ({ isOpen, onClose, mode }) => {
  const imageApiProvider = useAppStore(state => state.imageApiProvider)
  const setImageApiProvider = useAppStore(state => state.setImageApiProvider)
  const videoApiProvider = useAppStore(state => state.videoApiProvider)
  const setVideoApiProvider = useAppStore(state => state.setVideoApiProvider)

  const currentProvider = mode === 'image' ? imageApiProvider : videoApiProvider

  const handleSelect = (providerId: ApiProvider) => {
    if (mode === 'image') {
      setImageApiProvider(providerId)
    } else {
      setVideoApiProvider(providerId)
    }
  }

  const handleOpenWebsite = async (e: React.MouseEvent, website: string) => {
    e.stopPropagation()
    try {
      await open(website)
    } catch (error) {
      console.error('Failed to open URL:', error)
    }
  }

  const filteredProviders = API_PROVIDERS.filter(provider => {
    if (mode === 'image') {
      return provider.supportsImage
    } else {
      return provider.supportsVideo
    }
  })

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>选择 {mode === 'image' ? '图生图' : '图生视频'} API 服务</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.description}>
            选择您要使用的 {mode === 'image' ? '图生图' : '图生视频'} AI 生成服务提供商
          </p>

          <div className={styles.providerGrid}>
            {filteredProviders.map((provider) => (
              <div
                key={provider.id}
                className={`${styles.providerCard} ${currentProvider === provider.id ? styles.providerCardActive : ''}`}
                onClick={() => handleSelect(provider.id)}
              >
                <div className={styles.cardIcon}>
                  <ApiIcon provider={provider.id} size={40} />
                </div>
                
                <div className={styles.cardName}>{provider.name}</div>
                
                <div className={styles.cardTags}>
                  {provider.supportsImage && (
                    <span className={styles.miniTag}>图</span>
                  )}
                  {provider.supportsVideo && (
                    <span className={styles.miniTag}>视频</span>
                  )}
                </div>

                {currentProvider === provider.id && (
                  <div className={styles.selectedMark}>
                    <Check size={14} />
                  </div>
                )}

                <button
                  className={styles.websiteBtn}
                  onClick={(e) => handleOpenWebsite(e, provider.website)}
                  title="访问官网"
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.confirmBtn} onClick={onClose}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApiSelectorPanel
