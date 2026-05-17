import { Image, Video, Mic, Music, Sparkles, Wallet, Loader2 } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { WorkType, Changelog } from '../../types'
import ApiSelector from '../ApiSelector'
import { useAppStore } from '../../store/appStore'
import { API_PROVIDERS } from '../../types'
import ApiIcon from '../ApiSelector/ApiIcon'
import { RunningHubService } from '../../services/runningHubService'
import type { AccountStatus } from '../../services/runningHubService'
import { SeedanceService } from '../../services/seedanceService'
import styles from './Sidebar.module.css'

interface SidebarProps {
  activeMode: WorkType
  onModeChange: (mode: WorkType) => void
}

const Sidebar: React.FC<SidebarProps> = ({ activeMode, onModeChange }) => {
  const [showApiSelector, setShowApiSelector] = useState(false)
  const [showWallet, setShowWallet] = useState(false)
  const [walletInfo, setWalletInfo] = useState<AccountStatus | null>(null)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [seedanceTaskCount, setSeedanceTaskCount] = useState<number | null>(null)
  const [isLoadingSeedance, setIsLoadingSeedance] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('1.4.0')

  const imageApiProvider = useAppStore(state => state.imageApiProvider)
  const videoApiProvider = useAppStore(state => state.videoApiProvider)
  const apiConfigs = useAppStore(state => state.apiConfigs)

  const currentApiProvider = activeMode === 'image' ? imageApiProvider :
                             activeMode === 'video' ? videoApiProvider :
                             imageApiProvider

  const currentProvider = API_PROVIDERS.find((p) => p.id === currentApiProvider)

  const getApiSelectorMode = (): 'image' | 'video' => {
    return activeMode === 'video' ? 'video' : 'image'
  }

  useEffect(() => {
    const fetchLatestVersion = async () => {
      try {
        const response = await invoke<{ success: boolean; message: string; data: Changelog[] | null }>('tauri_get_changelogs')
        if (response.success && response.data && response.data.length > 0) {
          const sortedChangelogs = [...response.data].sort((a, b) => {
            const versionA = a.version.replace(/^v/, '').split('.').map(Number)
            const versionB = b.version.replace(/^v/, '').split('.').map(Number)
            for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
              const diff = (versionA[i] || 0) - (versionB[i] || 0)
              if (diff !== 0) return -diff
            }
            return 0
          })
          const latestVersion = sortedChangelogs[0]?.version
          if (latestVersion) {
            setAppVersion(latestVersion.replace(/^v/, ''))
          }
        }
      } catch (error) {
        console.error('[Sidebar] 获取版本号失败:', error)
      }
    }

    fetchLatestVersion()
  }, [])

  const handleLogoClick = useCallback(async () => {
    const runningHubConfig = apiConfigs.runninghub
    const volcarkConfig = apiConfigs.volcark
    
    if (!runningHubConfig?.apiKey && !volcarkConfig?.apiKey) {
      useAppStore.getState().addToast({
        type: 'error',
        title: '未配置',
        message: '请先配置 RunningHub 或火山引擎 API Key'
      })
      return
    }

    setIsLoadingWallet(true)
    setIsLoadingSeedance(true)
    setShowWallet(true)

    // 查询 RunningHub 钱包
    if (runningHubConfig?.apiKey) {
      try {
        const service = new RunningHubService(runningHubConfig)
        const result = await service.getAccountStatus()
        setWalletInfo(result)
      } catch (error) {
        console.error('[Sidebar] 获取钱包信息失败:', error)
        setWalletInfo({ success: false, error: '获取钱包信息失败' })
      } finally {
        setIsLoadingWallet(false)
      }
    } else {
      setIsLoadingWallet(false)
    }

    // 查询 Seedance 正在生成的任务数量
    if (volcarkConfig?.apiKey) {
      try {
        const service = new SeedanceService(volcarkConfig)
        const result = await service.getGeneratingTaskCount()
        if (result.success) {
          setSeedanceTaskCount(result.count ?? 0)
        } else {
          setSeedanceTaskCount(null)
        }
      } catch (error) {
        console.error('[Sidebar] 获取 Seedance 任务数量失败:', error)
        setSeedanceTaskCount(null)
      } finally {
        setIsLoadingSeedance(false)
      }
    } else {
      setIsLoadingSeedance(false)
    }
  }, [apiConfigs.runninghub, apiConfigs.volcark])

  return (
    <>
      <aside className={styles.sidebar}>
        <div className={styles.logo} onClick={handleLogoClick} style={{ cursor: 'pointer' }} title="点击查看 RunningHub 钱包">
          <div className={styles.logoIcon}>
            <img src="/logo.png" alt="旭言AI" />
          </div>
          <div className={styles.logoText}>
            <h1>旭言AI</h1>
            <span>AI内容生成工具</span>
          </div>
        </div>

        <div className={styles.modeSwitch}>
          <button
            className={`${styles.modeBtn} ${activeMode === 'image' ? styles.modeBtnActive : ''}`}
            onClick={() => onModeChange('image')}
          >
            <Image size={18} />
            <span>图生图</span>
          </button>
          <button
            className={`${styles.modeBtn} ${activeMode === 'video' ? styles.modeBtnActive : ''}`}
            onClick={() => onModeChange('video')}
          >
            <Video size={18} />
            <span>图生视频</span>
          </button>
          <button
            className={`${styles.modeBtn} ${activeMode === 'lipsync' ? styles.modeBtnActive : ''}`}
            onClick={() => onModeChange('lipsync')}
          >
            <Mic size={18} />
            <span>对口型</span>
          </button>
          <button
            className={`${styles.modeBtn} ${activeMode === 'voice' ? styles.modeBtnActive : ''}`}
            onClick={() => onModeChange('voice')}
          >
            <Music size={18} />
            <span>配音</span>
          </button>
          <button
            className={`${styles.modeBtn} ${activeMode === 'seedance2' ? styles.modeBtnActive : ''}`}
            onClick={() => onModeChange('seedance2')}
          >
            <Sparkles size={18} />
            <span>seedance2.0</span>
          </button>
        </div>

        <div className={styles.spacer} />

        {(activeMode === 'image' || activeMode === 'video') && (
          <div className={styles.apiSection}>
            <div className={styles.apiLabel}>
              {activeMode === 'image' ? '图生图 API' : '图生视频 API'}
            </div>
            <button 
              className={styles.apiTrigger}
              onClick={() => setShowApiSelector(true)}
            >
              <ApiIcon provider={currentApiProvider} size={20} />
              <div className={styles.apiInfo}>
                <span className={styles.apiName}>{currentProvider?.name}</span>
                <span className={styles.apiDesc}>{currentProvider?.description}</span>
              </div>
            </button>
          </div>
        )}

        <div className={styles.version}>
          <span>版本 {appVersion}</span>
        </div>
      </aside>

      <ApiSelector
        isOpen={showApiSelector}
        onClose={() => setShowApiSelector(false)}
        mode={getApiSelectorMode()}
      />

      {/* RunningHub 钱包弹窗 */}
      {showWallet && (
        <div className={styles.walletModal} onClick={() => setShowWallet(false)}>
          <div className={styles.walletContent} onClick={e => e.stopPropagation()}>
            <div className={styles.walletHeader}>
              <Wallet size={24} />
              <h3>API 账户信息</h3>
              <button className={styles.closeBtn} onClick={() => setShowWallet(false)}>×</button>
            </div>
            <div className={styles.walletBody}>
              {/* RunningHub 信息 */}
              {apiConfigs.runninghub?.apiKey && (
                <div className={styles.walletSection}>
                  <h4 className={styles.walletSectionTitle}>RunningHub</h4>
                  {isLoadingWallet ? (
                    <div className={styles.loading}>加载中...</div>
                  ) : walletInfo?.success ? (
                    <div className={styles.walletInfo}>
                      {walletInfo.remainCoins !== undefined && (
                        <div className={styles.walletItem}>
                          <span className={styles.walletLabel}>RH币</span>
                          <span className={styles.walletValue}>{Number(walletInfo.remainCoins).toFixed(2)}</span>
                        </div>
                      )}
                      {walletInfo.remainMoney !== undefined && (
                        <div className={styles.walletItem}>
                          <span className={styles.walletLabel}>余额</span>
                          <span className={styles.walletValue}>¥{Number(walletInfo.remainMoney).toFixed(2)}</span>
                        </div>
                      )}
                      {walletInfo.currentTaskCounts !== undefined && (
                        <div className={styles.walletItem}>
                          <span className={styles.walletLabel}>正在进行的任务</span>
                          <span className={styles.walletValue}>{walletInfo.currentTaskCounts}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={styles.error}>
                      {walletInfo?.error || '获取钱包信息失败'}
                    </div>
                  )}
                </div>
              )}

              {/* Seedance 2.0 信息 */}
              {apiConfigs.volcark?.apiKey && (
                <div className={styles.walletSection}>
                  <h4 className={styles.walletSectionTitle}>Seedance 2.0</h4>
                  {isLoadingSeedance ? (
                    <div className={styles.loading}>
                      <Loader2 size={16} className={styles.spinner} />
                      查询中...
                    </div>
                  ) : seedanceTaskCount !== null ? (
                    <div className={styles.walletInfo}>
                      <div className={styles.walletItem}>
                        <span className={styles.walletLabel}>进行中任务</span>
                        <span className={`${styles.walletValue} ${seedanceTaskCount > 0 ? styles.activeTasks : ''}`}>
                          {seedanceTaskCount}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.error}>获取任务数量失败</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Sidebar
