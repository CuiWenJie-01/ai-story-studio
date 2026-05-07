import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, FolderOpen, Plus, Download, Upload, RefreshCw, Users, Package, Image, Folder, FileAudio } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../../store/appStore'
import { CloudAssetService } from '../../services/cloudAssetService'
import type { CloudAssetLibrary, CloudAsset, AssetLibraryType } from '../../types'
import CustomSelect from '../CustomSelect/CustomSelect'
import styles from './AssetLibraryPanel.module.css'

interface AssetLibraryPanelProps {
  isOpen: boolean
  onClose: () => void
}

const ASSET_TYPE_OPTIONS = [
  { value: 'characters', label: '角色库', icon: Users },
  { value: 'props', label: '道具库', icon: Package },
  { value: 'scenes', label: '场景库', icon: Image },
  { value: 'others', label: '其他', icon: FileAudio },
]

const AssetLibraryPanel: React.FC<AssetLibraryPanelProps> = ({ isOpen, onClose }) => {
  const { user, activeTask, apiConfigs } = useAppStore()
  const volcarkConfig = apiConfigs.volcark

  const [libraries, setLibraries] = useState<CloudAssetLibrary[]>([])
  const [selectedLibrary, setSelectedLibrary] = useState<CloudAssetLibrary | null>(null)
  const [assetType, setAssetType] = useState<AssetLibraryType>('characters')
  const [assets, setAssets] = useState<CloudAsset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingLibraries, setIsLoadingLibraries] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadingAssets, setDownloadingAssets] = useState<Set<string>>(new Set())
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewAudio, setPreviewAudio] = useState<{ url: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newLibraryName, setNewLibraryName] = useState('')
  const [showNewLibrary, setShowNewLibrary] = useState(false)

  // 判断文件是否为音频
  const isAudioFile = (fileName: string): boolean => {
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
    return audioExtensions.includes(ext)
  }

  // 判断文件是否为图片
  const isImageFile = (fileName: string): boolean => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
    return imageExtensions.includes(ext)
  }

  const cloudAssetService = useMemo(() => {
    const accessKey = volcarkConfig.accessKey || ''
    const secretKey = volcarkConfig.secretKey || ''
    const bucket = volcarkConfig.bucket || ''
    const region = volcarkConfig.region || 'cn-beijing'
    
    // 只传有值的 endpoint，与对口型保持一致
    const tosConfig: { accessKey: string; secretKey: string; bucket: string; region: string; tosEndpoint?: string; s3Endpoint?: string } = {
      accessKey,
      secretKey,
      bucket,
      region,
    }
    
    // 只有当有值时才添加 endpoint 字段
    if (volcarkConfig.tosEndpoint) {
      tosConfig.tosEndpoint = volcarkConfig.tosEndpoint
    }
    if (volcarkConfig.s3Endpoint) {
      tosConfig.s3Endpoint = volcarkConfig.s3Endpoint
    }

    console.log('[AssetLibrary] 初始化TOS配置:', {
      hasAccessKey: !!accessKey,
      hasSecretKey: !!secretKey,
      hasBucket: !!bucket,
      region,
      tosEndpoint: volcarkConfig.tosEndpoint,
      s3Endpoint: volcarkConfig.s3Endpoint,
      source: volcarkConfig.accessKey ? 'volcarkConfig' : 'none'
    })

    return new CloudAssetService(
      tosConfig,
      user?.account || 'default'
    )
  }, [volcarkConfig.accessKey, volcarkConfig.secretKey, volcarkConfig.bucket, volcarkConfig.region, volcarkConfig.tosEndpoint, volcarkConfig.s3Endpoint, user?.account])

  const loadLibraries = useCallback(async (forceRefresh: boolean = false) => {
    setIsLoadingLibraries(true)
    setError(null)
    try {
      // 使用缓存机制，传入 onUpdate 回调用于后台更新
      const result = await cloudAssetService.listLibraries(
        (updatedLibraries) => {
          console.log('[AssetLibraryPanel] 后台更新资产库列表')
          setLibraries(updatedLibraries)
        },
        forceRefresh
      )

      if (result.success && result.libraries) {
        setLibraries(result.libraries)
        if (result.fromCache) {
          console.log('[AssetLibraryPanel] 从缓存加载资产库列表')
        }
      } else {
        setError(result.error || '加载资产库列表失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoadingLibraries(false)
    }
  }, [cloudAssetService])

  const loadAssets = useCallback(async (forceRefresh: boolean = false) => {
    if (!selectedLibrary) return
    setIsLoading(true)
    setError(null)
    try {
      console.log(`[AssetLibraryPanel] 加载资产列表, forceRefresh=${forceRefresh}`)
      // 使用缓存机制，传入 onUpdate 回调用于后台更新
      const result = await cloudAssetService.listAssets(
        selectedLibrary.name,
        assetType,
        (updatedAssets) => {
          console.log('[AssetLibraryPanel] 后台更新资产列表')
          setAssets(updatedAssets)
        },
        forceRefresh
      )

      if (result.success && result.assets) {
        setAssets(result.assets)
        if (result.fromCache) {
          console.log('[AssetLibraryPanel] 从缓存加载资产列表')
        } else {
          console.log('[AssetLibraryPanel] 从服务器加载资产列表')
        }
      } else {
        setError(result.error || '加载资产列表失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }, [cloudAssetService, selectedLibrary, assetType])

  useEffect(() => {
    if (isOpen) {
      loadLibraries()
    }
  }, [isOpen, loadLibraries])

  useEffect(() => {
    if (selectedLibrary) {
      loadAssets()
    }
  }, [selectedLibrary, assetType, loadAssets])

  const handleCreateLibrary = async () => {
    if (!newLibraryName.trim() || isCreating) return
    setIsCreating(true)
    setError(null)
    try {
      const result = await cloudAssetService.createLibrary(newLibraryName.trim())
      if (result.success) {
        useAppStore.getState().addToast({
          type: 'success',
          title: '创建成功',
          message: `资产库 "${newLibraryName.trim()}" 已创建`,
        })
        setNewLibraryName('')
        setShowNewLibrary(false)
        // 直接添加新创建的资产库到列表
        if (result.library) {
          setLibraries(prev => [result.library!, ...prev])
          setSelectedLibrary(result.library)
        }
        // 后台刷新完整列表
        const listResult = await cloudAssetService.listLibraries()
        if (listResult.success && listResult.libraries) {
          setLibraries(listResult.libraries)
        }
      } else {
        useAppStore.getState().addToast({
          type: 'error',
          title: '创建失败',
          message: result.error || '创建资产库失败',
        })
        setError(result.error || '创建资产库失败')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '创建失败'
      useAppStore.getState().addToast({
        type: 'error',
        title: '创建失败',
        message: errorMsg,
      })
      setError(errorMsg)
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpload = async () => {
    if (!selectedLibrary) return

    // 根据资产类型选择文件过滤器
    const filters = assetType === 'others'
      ? [{
          name: '音频和图片',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
        }]
      : [{
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
        }]

    const files = await open({
      multiple: true,
      filters,
    })

    if (!files || files.length === 0) return

    const fileArray = Array.isArray(files) ? files : [files]

    setIsUploading(true)
    setError(null)
    try {
      let successCount = 0
      let failCount = 0

      const uploadWithProgress = async (file: string, fileName: string) => {
        const result = await cloudAssetService.uploadAsset(
          selectedLibrary.name,
          assetType,
          file,
          fileName,
          String(user?.id || '0'),
          user?.nickname
        )
        return result
      }

      const batchSize = 3
      for (let i = 0; i < fileArray.length; i += batchSize) {
        const batch = fileArray.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map((file, batchIndex) => {
            const fileName = file.split(/[/\\]/).pop() || `file${batchIndex}.png`
            return uploadWithProgress(file, fileName)
          })
        )

        for (const result of results) {
          if (result.success) {
            successCount++
          } else {
            failCount++
          }
        }
      }

      if (successCount > 0) {
        await loadAssets()
        useAppStore.getState().addToast({
          type: 'success',
          title: '上传完成',
          message: `成功 ${successCount} 个${failCount > 0 ? `, 失败 ${failCount} 个` : ''}`,
        })
      } else if (failCount > 0) {
        setError(`${failCount} 个文件上传失败`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDownload = async (asset: CloudAsset) => {
    if (!activeTask?.path) {
      setError('请先选择一个任务项目')
      return
    }

    const folderMap: Record<AssetLibraryType, string> = {
      characters: '角色库',
      props: '道具库',
      scenes: '场景库',
      others: '其他库',
    }

    const folder = `${activeTask.path}\\${folderMap[asset.type]}`
    const localPath = `${folder}\\${asset.fileName}`

    setDownloadingAssets(prev => new Set(prev).add(asset.id))
    setError(null)
    try {
      const result = await cloudAssetService.downloadAsset(asset.url, localPath)
      if (result.success) {
        useAppStore.getState().addToast({
          type: 'success',
          title: '下载成功',
          message: `已保存到 ${folder}`,
        })
      } else {
        setError(result.error || '下载失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败')
    } finally {
      setDownloadingAssets(prev => {
        const next = new Set(prev)
        next.delete(asset.id)
        return next
      })
    }
  }

  const handleDownloadAll = async () => {
    if (!activeTask?.path) {
      setError('请先选择一个任务项目')
      return
    }

    setIsDownloading(true)
    setError(null)

    const folderMap: Record<AssetLibraryType, string> = {
      characters: '角色库',
      props: '道具库',
      scenes: '场景库',
      others: '其他库',
    }

    const folder = `${activeTask.path}\\${folderMap[assetType]}`

    try {
      // 并发下载所有资产
      const results = await Promise.allSettled(
        assets.map(async (asset) => {
          const localPath = `${folder}\\${asset.fileName}`
          return cloudAssetService.downloadAsset(asset.url, localPath)
        })
      )

      const successCount = results.filter(r => r.status === 'fulfilled').length
      const failCount = results.filter(r => r.status === 'rejected').length

      if (failCount === 0) {
        useAppStore.getState().addToast({
          type: 'success',
          title: '下载完成',
          message: `已将 ${successCount} 个资产下载到 ${folder}`,
        })
      } else {
        useAppStore.getState().addToast({
          type: 'warning',
          title: '下载完成（部分失败）',
          message: `成功 ${successCount} 个，失败 ${failCount} 个`,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDeleteAsset = async (asset: CloudAsset) => {
    if (!confirm(`确定要删除 "${asset.name}" 吗？`)) return
    
    // 立即从UI列表中移除
    setAssets(prev => prev.filter(a => a.id !== asset.id))
    
    // 后台异步执行云端删除
    cloudAssetService.deleteAsset(asset).then(result => {
      if (result.success) {
        useAppStore.getState().addToast({
          type: 'success',
          title: '删除成功',
          message: `已删除 "${asset.name}"`,
        })
      } else {
        console.error(`[CloudAsset] 删除云端资产失败: ${asset.name}`, result.error)
        useAppStore.getState().addToast({
          type: 'error',
          title: '删除失败',
          message: `"${asset.name}" 云端删除失败: ${result.error || '未知错误'}`,
        })
      }
    }).catch(err => {
      console.error(`[CloudAsset] 删除云端资产异常: ${asset.name}`, err)
      useAppStore.getState().addToast({
        type: 'error',
        title: '删除失败',
        message: `"${asset.name}" 云端删除异常`,
      })
    })
  }

  if (!isOpen) return null

  const currentTypeConfig = ASSET_TYPE_OPTIONS.find(t => t.value === assetType)
  const TypeIcon = currentTypeConfig?.icon || Image

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <FolderOpen size={20} />
            <span>云端资产库</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className={styles.errorBar}>
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className={styles.content}>
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <span>资产库列表</span>
              <div className={styles.sidebarActions}>
                <button
                  className={styles.refreshBtn}
                  onClick={() => {
                    console.log('[AssetLibraryPanel] 手动刷新资产库列表')
                    loadLibraries(true)
                  }}
                  disabled={isLoadingLibraries}
                  title="刷新列表"
                >
                  <RefreshCw size={14} className={isLoadingLibraries ? styles.spinning : ''} />
                </button>
                <button
                  className={styles.addBtn}
                  onClick={() => setShowNewLibrary(true)}
                  disabled={isCreating}
                  title="创建新资产库"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {showNewLibrary && (
              <div className={styles.newLibraryForm}>
                <input
                  type="text"
                  placeholder="资产库名称"
                  value={newLibraryName}
                  onChange={e => setNewLibraryName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateLibrary()}
                  disabled={isCreating}
                  autoFocus
                />
                <button
                  className={styles.confirmBtn}
                  onClick={handleCreateLibrary}
                  disabled={!newLibraryName.trim() || isCreating}
                >
                  {isCreating ? '创建中...' : '创建'}
                </button>
                <button
                  className={styles.cancelBtn}
                  onClick={() => { setShowNewLibrary(false); setNewLibraryName('') }}
                  disabled={isCreating}
                >
                  取消
                </button>
              </div>
            )}

            <div className={styles.libraryList}>
              {isLoadingLibraries ? (
                <div className={styles.loadingLibraries}>
                  <RefreshCw size={24} className={styles.spinning} />
                  <span>正在加载资产库...</span>
                </div>
              ) : libraries.length === 0 ? (
                <div className={styles.emptyList}>
                  <Folder size={32} />
                  <p>暂无资产库</p>
                  <span>点击上方 + 创建</span>
                </div>
              ) : (
                libraries.map(lib => (
                  <div
                    key={lib.id}
                    className={`${styles.libraryItem} ${selectedLibrary?.id === lib.id ? styles.libraryItemActive : ''}`}
                    onClick={() => setSelectedLibrary(lib)}
                  >
                    <Folder size={16} />
                    <span className={styles.libraryName}>{lib.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.mainContent}>
            {!selectedLibrary ? (
              <div className={styles.placeholder}>
                <FolderOpen size={48} />
                <p>请选择一个资产库</p>
              </div>
            ) : (
              <>
                <div className={styles.toolbar}>
                  <div className={styles.toolbarLeft}>
                    <CustomSelect
                      value={assetType}
                      options={ASSET_TYPE_OPTIONS.map(t => ({
                        value: t.value,
                        label: t.label,
                      }))}
                      onChange={v => setAssetType(v as AssetLibraryType)}
                    />
                    <button
                      className={styles.toolbarBtn}
                      onClick={() => {
                        console.log('[AssetLibraryPanel] 手动刷新资产列表(强制)')
                        loadAssets(true)
                      }}
                      disabled={isLoading}
                      title="刷新"
                    >
                      <RefreshCw size={16} className={isLoading ? styles.spinning : ''} />
                    </button>
                  </div>
                  <div className={styles.toolbarRight}>
                    <button
                      className={styles.uploadBtn}
                      onClick={handleUpload}
                      disabled={isUploading}
                    >
                      <Upload size={16} />
                      <span>{isUploading ? '上传中...' : '上传'}</span>
                    </button>
                    <button
                      className={styles.downloadAllBtn}
                      onClick={handleDownloadAll}
                      disabled={isDownloading || assets.length === 0}
                    >
                      <Download size={16} />
                      <span>{isDownloading ? '下载中...' : `一键下载 (${assets.length})`}</span>
                    </button>
                  </div>
                </div>

                <div className={styles.assetList}>
                  {isLoading ? (
                    <div className={styles.loading}>
                      <RefreshCw size={32} className={styles.spinning} />
                      <span>加载中...</span>
                    </div>
                  ) : assets.length === 0 ? (
                    <div className={styles.emptyAssets}>
                      <TypeIcon size={48} />
                      <p>暂无{currentTypeConfig?.label}</p>
                      <span>点击上方"上传"添加资产</span>
                    </div>
                  ) : (
                    <div className={styles.assetGrid}>
                      {assets.map(asset => (
                        <div key={asset.id} className={styles.assetCard}>
                          <div className={styles.assetImage}>
                            {isImageFile(asset.fileName) ? (
                              <img src={asset.url} alt={asset.name} onClick={() => setPreviewImage(asset.url)} />
                            ) : isAudioFile(asset.fileName) ? (
                              <div className={styles.audioPlaceholder} onClick={() => setPreviewAudio({ url: asset.url, name: asset.name })}>
                                <FileAudio size={48} />
                                <span className={styles.audioLabel}>音频</span>
                              </div>
                            ) : (
                              <div className={styles.unknownPlaceholder}>
                                <span>未知文件</span>
                              </div>
                            )}
                            <button
                              className={styles.deleteAssetBtn}
                              onClick={() => handleDeleteAsset(asset)}
                              title="删除"
                            >
                              <X size={14} />
                            </button>
                            <div className={styles.assetOverlay}>
                              <button
                                className={styles.downloadBtn}
                                onClick={() => handleDownload(asset)}
                                disabled={downloadingAssets.has(asset.id)}
                              >
                                <Download size={20} />
                              </button>
                              {isImageFile(asset.fileName) && (
                                <button
                                  className={styles.viewBtn}
                                  onClick={() => setPreviewImage(asset.url)}
                                >
                                  <Image size={20} />
                                </button>
                              )}
                              {isAudioFile(asset.fileName) && (
                                <button
                                  className={styles.viewBtn}
                                  onClick={() => setPreviewAudio({ url: asset.url, name: asset.name })}
                                >
                                  <FileAudio size={20} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className={styles.assetInfo}>
                            <span className={styles.assetName} title={asset.name}>
                              {asset.name}
                            </span>
                            {asset.uploadedByNickname && (
                              <span className={styles.uploader}>
                                by {asset.uploadedByNickname}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {previewImage && (
            <div className={styles.previewModal} onClick={() => setPreviewImage(null)}>
              <div className={styles.previewContent} onClick={e => e.stopPropagation()}>
                <button className={styles.previewClose} onClick={() => setPreviewImage(null)}>
                  <X size={24} />
                </button>
                <img src={previewImage} alt="预览" />
              </div>
            </div>
          )}

          {previewAudio && (
            <div className={styles.previewModal} onClick={() => setPreviewAudio(null)}>
              <div className={styles.previewContent} onClick={e => e.stopPropagation()}>
                <button className={styles.previewClose} onClick={() => setPreviewAudio(null)}>
                  <X size={24} />
                </button>
                <div className={styles.audioPreview}>
                  <FileAudio size={64} />
                  <span className={styles.audioPreviewName}>{previewAudio.name}</span>
                  <audio src={previewAudio.url} controls autoPlay />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AssetLibraryPanel