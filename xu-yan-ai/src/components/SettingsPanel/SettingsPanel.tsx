import { useState, useRef, memo, useMemo, useCallback } from 'react'
import { X, FolderOpen, Check, Save, Eye, EyeOff, Plus, Trash2, Edit2, RefreshCw } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../../store/appStore'
import type { AppSettings, ApiProvider, ApiConfig, RunningHubApiMapping } from '../../types'
import { API_PROVIDERS } from '../../types'
import ApiIcon from '../ApiSelector/ApiIcon'
import CustomSelect from '../CustomSelect/CustomSelect'
import { RunningHubService } from '../../services/runningHubService'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsPanelContent: React.FC<{
  settings: AppSettings
  onClose: () => void
  updateSettings: (settings: Partial<AppSettings>) => void
  imageApiProvider: string
  videoApiProvider: string
}> = ({ settings: initialSettings, onClose, updateSettings, imageApiProvider, videoApiProvider }) => {
  const [localSettings, setLocalSettings] = useState(initialSettings)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const showConcurrentSetting = imageApiProvider === 'runninghub' || videoApiProvider === 'runninghub'

  const handleSave = () => {
    setSaveStatus('saving')
    updateSettings(localSettings)
    setTimeout(() => {
      setSaveStatus('saved')
      setTimeout(() => {
        setSaveStatus('idle')
        onClose()
      }, 500)
    }, 300)
  }

  const handlePathSelect = async () => {
    try {
      const result = await open({
        directory: true,
        multiple: false,
        title: '选择任务保存路径',
      })
      
      if (result) {
        const path = typeof result === 'string' ? result : (result as string[])[0]
        if (path) {
          setLocalSettings({ ...localSettings, savePath: path })
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
    }
  }

  return (
    <>
      <div className={styles.header}>
        <h2>设置</h2>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <h3>任务保存路径</h3>
          <div className={styles.field}>
            <label>保存路径</label>
            <div className={styles.pathSelector}>
              <input
                type="text"
                value={localSettings.savePath}
                onChange={(e) => setLocalSettings({ ...localSettings, savePath: e.target.value })}
                placeholder="选择或输入保存路径"
              />
              <button className={styles.browseBtn} onClick={handlePathSelect}>
                <FolderOpen size={16} />
                浏览
              </button>
            </div>
          </div>
        </div>

        {showConcurrentSetting && (
          <>
            <div className={styles.section}>
              <h3>并发设置 (RunningHub)</h3>
              <div className={styles.field}>
                <label>最大并发数 (1-20)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={localSettings.maxConcurrent}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    maxConcurrent: Math.min(20, Math.max(1, parseInt(e.target.value) || 2))
                  })}
                />
                <p className={styles.fieldHint}>
                  RunningHub API 的最大并发任务数
                </p>
              </div>
            </div>
          </>
        )}

        <div className={styles.section}>
          <h3>提示词设置</h3>
          <div className={styles.field}>
            <label>提示词字体大小 ({localSettings.promptFontSize}px)</label>
            <input
              type="range"
              min={12}
              max={24}
              value={localSettings.promptFontSize}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                promptFontSize: parseInt(e.target.value)
              })}
            />
            <p className={styles.fieldHint}>
              调整所有提示词输入框的字体大小 (12-24px)，包括图生图、图生视频、Seedance2.0 等
            </p>
          </div>
          <div className={styles.field}>
            <label>
              <input
                type="checkbox"
                checked={localSettings.compressReferenceImages}
                onChange={(e) => setLocalSettings({
                  ...localSettings,
                  compressReferenceImages: e.target.checked
                })}
                style={{ marginRight: '8px' }}
              />
              启用参考图压缩
            </label>
            <p className={styles.fieldHint}>
              压缩参考图片到 1024px，JPEG 质量 80%，可减少上传时间（默认关闭）
            </p>
          </div>
        </div>

        <div className={styles.section}>
          <h3>画质增强</h3>
          <div className={styles.field}>
            <label>增强场景</label>
            <select
              value={localSettings.enhanceScene || 'short_series'}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                enhanceScene: e.target.value as AppSettings['enhanceScene']
              })}
            >
              <option value="short_series">短剧（默认）</option>
              <option value="aigc">AIGC 内容</option>
              <option value="common">通用</option>
              <option value="ugc">UGC 短视频</option>
            </select>
            <p className={styles.fieldHint}>
              不同场景对画质增强的处理策略不同。如果增强后锐化过度，可尝试切换到"AIGC 内容"或"通用"
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            取消
          </button>
          <button 
            className={`${styles.saveBtn} ${saveStatus === 'saving' ? styles.saving : ''}`}
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? (
              <>
                <span className={styles.spinner} />
                保存中...
              </>
            ) : saveStatus === 'saved' ? (
              <>
                <Check size={16} />
                已保存
              </>
            ) : (
              <>
                <Save size={16} />
                保存设置
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}

const FieldTypeSelector: React.FC<{
  value: string
  onChange: (value: string) => void
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const fieldTypes = [
    { value: 'image', label: '图片', color: '#10b981' },
    { value: 'text', label: '文本', color: '#3b82f6' },
    { value: 'prompt', label: '提示词', color: '#8b5cf6' },
    { value: 'value', label: '数值', color: '#f59e0b' },
    { value: 'aspectRatio', label: '宽高比', color: '#ec4899' },
    { value: 'resolution', label: '分辨率', color: '#06b6d4' },
    { value: 'horizontal_angle', label: '水平角度', color: '#ef4444' },
    { value: 'vertical_angle', label: '垂直角度', color: '#22c55e' },
    { value: 'zoom', label: '缩放', color: '#0ea5e9' },
  ]

  const selectedType = fieldTypes.find(t => t.value === value) || fieldTypes[0]

  return (
    <div className={styles.fieldTypeWrapper}>
      <button
        ref={buttonRef}
        className={styles.fieldTypeBtn}
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderColor: selectedType.color }}
      >
        <span 
          className={styles.fieldTypeDot} 
          style={{ backgroundColor: selectedType.color }}
        />
        {selectedType.label}
      </button>
      
      {isOpen && (
        <div 
          className={styles.fieldTypeOverlay} 
          onClick={() => setIsOpen(false)}
        >
          <div className={styles.fieldTypePopup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.fieldTypePopupHeader}>
              选择字段类型
            </div>
            <div className={styles.fieldTypePopupContent}>
              {fieldTypes.map((type) => (
                <button
                  key={type.value}
                  className={`${styles.fieldTypeOption} ${value === type.value ? styles.fieldTypeOptionActive : ''}`}
                  onClick={() => {
                    onChange(type.value)
                    setIsOpen(false)
                  }}
                >
                  <span 
                    className={styles.fieldTypeDot} 
                    style={{ backgroundColor: type.color }}
                  />
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const RunningHubMappingEditor: React.FC<{
  mapping: RunningHubApiMapping
  onSave: (mapping: RunningHubApiMapping) => void
  onCancel: () => void
}> = ({ mapping: initialMapping, onSave, onCancel }) => {
  const { apiConfigs } = useAppStore()
  const [mapping, setMapping] = useState(initialMapping)
  const [isLoadingNodes, setIsLoadingNodes] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const handleFetchNodes = async () => {
    if (!mapping.appId) {
      setLoadError('请先输入 App ID')
      return
    }

    const config = apiConfigs.runninghub
    if (!config.apiKey) {
      setLoadError('请先配置 RunningHub API Key')
      return
    }

    setIsLoadingNodes(true)
    setLoadError(null)

    try {
      const service = new RunningHubService(config)
      const result = await service.getAppInfo(mapping.appId)

      if (result.success && result.nodeInfoList) {
        setMapping(prev => ({
          ...prev,
          nodeInfoList: result.nodeInfoList!,
        }))
        console.log('[Settings] 成功获取节点信息:', result.nodeInfoList)
      } else {
        setLoadError(result.error || '获取节点信息失败，请手动配置')
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '获取节点信息失败')
    } finally {
      setIsLoadingNodes(false)
    }
  }

  const handleAddNode = () => {
    setMapping(prev => ({
      ...prev,
      nodeInfoList: [
        ...prev.nodeInfoList,
        { nodeId: '', fieldName: 'image', description: '' }
      ]
    }))
  }

  const handleUpdateNode = (index: number, field: 'nodeId' | 'fieldName' | 'description', value: string) => {
    setMapping(prev => ({
      ...prev,
      nodeInfoList: prev.nodeInfoList.map((node, i) => 
        i === index ? { ...node, [field]: value } : node
      )
    }))
  }

  const handleRemoveNode = (index: number) => {
    setMapping(prev => ({
      ...prev,
      nodeInfoList: prev.nodeInfoList.filter((_, i) => i !== index)
    }))
  }

  return (
    <div className={styles.mappingEditor}>
      <div className={styles.field}>
        <label>映射名称</label>
        <input
          type="text"
          value={mapping.name}
          onChange={(e) => setMapping({ ...mapping, name: e.target.value })}
          placeholder="输入映射名称"
        />
      </div>
      <div className={styles.field}>
        <label>App ID</label>
        <div className={styles.inputWithBtn}>
          <input
            type="text"
            value={mapping.appId}
            onChange={(e) => setMapping({ ...mapping, appId: e.target.value })}
            placeholder="输入 App ID"
          />
          <button 
            className={styles.fetchBtn}
            onClick={handleFetchNodes}
            disabled={isLoadingNodes || !mapping.appId}
            title="尝试自动获取节点信息"
          >
            {isLoadingNodes ? (
              <span className={styles.spinner} />
            ) : (
              <RefreshCw size={16} />
            )}
          </button>
        </div>
        <div className={styles.fieldHint}>
          点击刷新按钮尝试自动获取节点（部分应用可能不支持）
        </div>
      </div>
      <div className={styles.field}>
        <label>类型</label>
        <CustomSelect
          value={mapping.type}
          options={[
            { value: 'image', label: '图生图' },
            { value: 'video', label: '视频生成' },
            { value: 'viewAngle', label: '视角转换' },
            { value: 'text2image', label: '文生图' },
          ]}
          onChange={(value) => setMapping({ ...mapping, type: value as 'image' | 'video' | 'viewAngle' | 'text2image' })}
        />
      </div>
      
      {loadError && (
        <div className={styles.errorMsg}>{loadError}</div>
      )}
      
      <div className={styles.nodesSection}>
        <div className={styles.nodesHeader}>
          <label>节点配置</label>
          <button className={styles.addNodeBtn} onClick={handleAddNode}>
            <Plus size={14} /> 添加节点
          </button>
        </div>
        
        {mapping.nodeInfoList.length > 0 ? (
          <div className={styles.nodesEditor}>
            {mapping.nodeInfoList.map((node, index) => (
              <div key={index} className={styles.nodeRow}>
                <input
                  type="text"
                  value={node.nodeId}
                  onChange={(e) => handleUpdateNode(index, 'nodeId', e.target.value)}
                  placeholder="节点ID"
                  className={styles.nodeIdInput}
                />
                <FieldTypeSelector
                  value={node.fieldName}
                  onChange={(value) => handleUpdateNode(index, 'fieldName', value)}
                />
                <input
                  type="text"
                  value={node.description}
                  onChange={(e) => handleUpdateNode(index, 'description', e.target.value)}
                  placeholder="描述"
                  className={styles.nodeDescInput}
                />
                <button 
                  className={styles.removeNodeBtn}
                  onClick={() => handleRemoveNode(index)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.noNodes}>
            暂无节点配置，请点击"添加节点"手动配置
          </div>
        )}
      </div>
      
      <div className={styles.editorActions}>
        <button className={styles.cancelBtn} onClick={onCancel}>取消</button>
        <button className={styles.saveBtn} onClick={() => onSave(mapping)}>保存</button>
      </div>
    </div>
  )
}

const RunningHubMappingsSection: React.FC = () => {
  const { runningHubMappings, addRunningHubMapping, updateRunningHubMapping, removeRunningHubMapping } = useAppStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = () => {
    setIsAdding(true)
  }

  const handleSaveNew = (mapping: RunningHubApiMapping) => {
    addRunningHubMapping({
      ...mapping,
      id: `mapping-${Date.now()}`,
    })
    setIsAdding(false)
  }

  const handleSaveEdit = (mapping: RunningHubApiMapping) => {
    updateRunningHubMapping(mapping.id, mapping)
    setEditingId(null)
  }

  const newMapping: RunningHubApiMapping = {
    id: '',
    name: '',
    appId: '',
    type: 'image',
    nodeInfoList: [],
  }

  return (
    <div className={styles.mappingsSection}>
      <div className={styles.mappingsHeader}>
        <h4>API 映射配置</h4>
        <button className={styles.addBtn} onClick={handleAdd}>
          <Plus size={16} />
          添加映射
        </button>
      </div>

      <div className={styles.mappingsList}>
        {runningHubMappings.map((mapping) => (
          <div key={mapping.id} className={styles.mappingItem}>
            {editingId === mapping.id ? (
              <RunningHubMappingEditor
                mapping={mapping}
                onSave={handleSaveEdit}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className={styles.mappingInfo}>
                  <span className={styles.mappingName}>{mapping.name}</span>
                  <span className={styles.mappingType}>
                    {mapping.type === 'image' ? '图生图' : mapping.type === 'video' ? '视频生成' : mapping.type === 'viewAngle' ? '视角转换' : '文生图'}
                  </span>
                </div>
                <div className={styles.mappingId}>App ID: {mapping.appId}</div>
                <div className={styles.mappingActions}>
                  <button 
                    className={styles.editBtn}
                    onClick={() => setEditingId(mapping.id)}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    className={styles.deleteBtn}
                    onClick={() => removeRunningHubMapping(mapping.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {isAdding && (
          <div className={styles.mappingItem}>
            <RunningHubMappingEditor
              mapping={newMapping}
              onSave={handleSaveNew}
              onCancel={() => setIsAdding(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

const ApiConfigSection: React.FC<{
  provider: ApiProvider
  config: ApiConfig
  onUpdate: (config: Partial<ApiConfig>) => void
}> = memo(({ provider, config, onUpdate }) => {
  const [showApiKey, setShowApiKey] = useState(false)
  const [showApiSecret, setShowApiSecret] = useState(false)
  const providerInfo = API_PROVIDERS.find(p => p.id === provider)
  
  const {
    runningHubMappings, 
    runningHubImageMappingId, 
    runningHubVideoMappingId,
    runningHubViewAngleMappingId,
    runningHubText2ImageMappingId,
    setRunningHubImageMappingId,
    setRunningHubVideoMappingId,
    setRunningHubViewAngleMappingId,
    setRunningHubText2ImageMappingId,
    amkApiKey,
    setAmkApiKey,
  } = useAppStore()
  
  const imageMappings = useMemo(() => runningHubMappings.filter(m => m.type === 'image'), [runningHubMappings])
  const videoMappings = useMemo(() => runningHubMappings.filter(m => m.type === 'video'), [runningHubMappings])
  const viewAngleMappings = useMemo(() => runningHubMappings.filter(m => m.type === 'viewAngle'), [runningHubMappings])
  const text2ImageMappings = useMemo(() => runningHubMappings.filter(m => m.type === 'text2image'), [runningHubMappings])

  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ apiKey: e.target.value })
  }, [onUpdate])

  const handleApiSecretChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ apiSecret: e.target.value })
  }, [onUpdate])

  const handleEndpointChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ endpoint: e.target.value })
  }, [onUpdate])

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ model: e.target.value })
  }, [onUpdate])

  const handleCookieChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ cookie: e.target.value })
  }, [onUpdate])

  const handleGroupIdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ groupId: e.target.value })
  }, [onUpdate])

  const handleImageMappingChange = useCallback((value: string) => {
    setRunningHubImageMappingId(value || null)
  }, [setRunningHubImageMappingId])

  const handleVideoMappingChange = useCallback((value: string) => {
    setRunningHubVideoMappingId(value || null)
  }, [setRunningHubVideoMappingId])

  const handleViewAngleMappingChange = useCallback((value: string) => {
    setRunningHubViewAngleMappingId(value || null)
  }, [setRunningHubViewAngleMappingId])

  const handleText2ImageMappingChange = useCallback((value: string) => {
    setRunningHubText2ImageMappingId(value || null)
  }, [setRunningHubText2ImageMappingId])

  const imageMappingOptions = useMemo(() => [
    { value: '', label: '请选择图生图 API' },
    ...imageMappings.map((mapping) => ({ value: mapping.id, label: mapping.name }))
  ], [imageMappings])

  const videoMappingOptions = useMemo(() => [
    { value: '', label: '请选择图生视频 API' },
    ...videoMappings.map((mapping) => ({ value: mapping.id, label: mapping.name }))
  ], [videoMappings])

  const viewAngleMappingOptions = useMemo(() => [
    { value: '', label: '请选择视角转换 API' },
    ...viewAngleMappings.map((mapping) => ({ value: mapping.id, label: mapping.name }))
  ], [viewAngleMappings])

  const text2ImageMappingOptions = useMemo(() => [
    { value: '', label: '请选择文生图 API' },
    ...text2ImageMappings.map((mapping) => ({ value: mapping.id, label: mapping.name }))
  ], [text2ImageMappings])

  const modelOptions = useMemo(() => [
    { value: 'speech-2.8-turbo', label: 'speech-2.8-turbo (快速)' },
    { value: 'speech-2.8-hd', label: 'speech-2.8-hd (高清)' },
  ], [])

  const geminiModelOptions = useMemo(() => [
    { value: 'gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview (推荐)' },
    { value: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview (专业版)' },
    { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image (快速)' },
  ], [])

  const yunwuImageModelOptions = useMemo(() => [
    { value: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview (推荐)' },
    { value: 'gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview (快速)' },
    
    { value: 'gpt-image-2', label: 'gpt-image-2 (目前只支持文生图)' },
    { value: 'gpt-image-2-all', label: 'gpt-image-2-all (目前只支持文生图)' },
  ], [])

  const yunwuVideoModelOptions = useMemo(() => [
    { value: 'viduq3-turbo', label: 'viduq3-turbo (推荐，速度快，⚡4.0/次)' },
    { value: 'viduq3-pro', label: 'viduq3-pro (高质量，⚡2.4/次)' },
    { value: 'viduq2', label: 'viduq2 (最新，⚡3.7/次)' },
    { value: 'viduq1', label: 'viduq1 (基础，⚡4.0/次)' },
    { value: 'veo3.1-4k', label: 'veo3.1-4k (4K, ⚡1.0/次)' },
    { value: 'veo3.1-pro-4k', label: 'veo3.1-pro-4k (4k, ⚡4.8/次)' },
    { value: 'veo3.1-pro', label: 'veo3.1-pro (720P/1080P, ⚡4.8/次)' },
    { value: 'veo_3_1', label: 'veo_3_1 (720P/1080P, ⚡0.73/次)' },
    { value: 'veo_3_1-fast-4K', label: 'veo_3_1-fast-4K (4k,⚡0.43/次)' },
    { value: 'veo_3_1-components-4K', label: 'veo_3_1-components-4K (4k,⚡0.85/次,支持首帧，不支持尾帧)' },
    { value: 'veo_3_1-components', label: 'veo_3_1-components (720P/1080P,⚡0.73/次,支持首帧，不支持尾帧)' },
    { value: 'grok-video-3', label: 'grok-video-3 (5秒)' },
    { value: 'grok-video-3-10s', label: 'grok-video-3-10s (10秒)' },
  ], [])

  const yunwuResolutionOptions = useMemo(() => {
    const videoModel = config.videoModel || 'viduq3-turbo'
    const isVeo = videoModel.startsWith('veo')
    const isGrok = videoModel.startsWith('grok')
    const is4k = videoModel.includes('4k') || videoModel.includes('4K')

    if (isVeo && is4k) {
      return [{ value: '4k', label: '4K（由模型决定）' }]
    }
    if (isVeo || isGrok) {
      return [
        { value: '720p', label: '720p (默认)' },
        { value: '1080p', label: '1080p' },
      ]
    }
    return [
      { value: '540p', label: '540p' },
      { value: '720p', label: '720p (默认)' },
      { value: '1080p', label: '1080p' },
    ]
  }, [config.videoModel])

  const videoModelOptions = useMemo(() => [
    { value: 'seedance2-5s', label: 'Seedance 2.0 - 5秒 (推荐)' },
    { value: 'seedance2-10s', label: 'Seedance 2.0 - 10秒' },
    { value: 'seedance2-15s', label: 'Seedance 2.0 - 15秒' },
  ], [])

  const tosRegionOptions = useMemo(() => [
    { value: 'cn-beijing', label: '华北2(北京)' },
    { value: 'cn-guangzhou', label: '华南1(广州)' },
    { value: 'cn-shanghai', label: '华东2(上海)' },
    { value: 'cn-hongkong', label: '香港' },
    { value: 'ap-southeast-1', label: '东南亚(新加坡)' },
    { value: 'ap-southeast-2', label: '亚太(雅加达)' },
    { value: 'us-east-1', label: '美东(弗吉尼亚)' },
    { value: 'us-west-1', label: '美西(硅谷)' },
    { value: 'eu-central-1', label: '欧洲(法兰克福)' },
  ], [])

  const jimengVideoModelOptions = useMemo(() => [
    { value: 'jimeng_v30_1080p', label: '即梦3.0 1080P (推荐)' },
    { value: 'jimeng_v30_720p', label: '即梦3.0 720P (快速)' },
  ], [])

  return (
    <div className={styles.apiSection}>
      <div className={styles.apiHeader}>
        <ApiIcon provider={provider} size={24} />
        <div className={styles.apiInfo}>
          <span className={styles.apiName}>{providerInfo?.name}</span>
          <span className={styles.apiDesc}>{providerInfo?.description}</span>
        </div>
      </div>

      <div className={styles.apiFields}>
        <div className={styles.field}>
          <label>API Key</label>
          <div className={styles.inputWithBtn}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={handleApiKeyChange}
              placeholder="输入 API Key"
            />
            <button 
              className={styles.toggleBtn}
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {(provider === 'kling' || provider === 'jimeng') && (
          <div className={styles.field}>
            <label>{provider === 'jimeng' ? 'Secret Access Key' : 'API Secret'}</label>
            <div className={styles.inputWithBtn}>
              <input
                type={showApiSecret ? 'text' : 'password'}
                value={config.apiSecret || ''}
                onChange={handleApiSecretChange}
                placeholder={provider === 'jimeng' ? '输入 Secret Access Key' : '输入 API Secret'}
              />
              <button 
                className={styles.toggleBtn}
                onClick={() => setShowApiSecret(!showApiSecret)}
              >
                {showApiSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {provider === 'jimeng' && (
              <p className={styles.fieldHint}>
                即梦API需要 Access Key ID 和 Secret Access Key 进行鉴权
              </p>
            )}
          </div>
        )}

        {provider === 'jimeng' && (
          <div className={styles.field}>
            <label>Cookie (可选)</label>
            <textarea
              value={config.cookie || ''}
              onChange={handleCookieChange}
              placeholder="如果视频下载失败，可在此输入即梦网站的 Cookie"
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
            />
            <p className={styles.fieldHint}>
              用于下载防盗链保护的视频。在浏览器登录即梦后，按F12打开开发者工具，在 Network 标签页找到请求，复制 Cookie 值
            </p>
          </div>
        )}

        {provider === 'jimeng' && (
          <div className={styles.field}>
            <label>视频模型</label>
            <CustomSelect
              value={config.videoModel || 'jimeng_v30_1080p'}
              options={jimengVideoModelOptions}
              onChange={(value) => onUpdate({ videoModel: value })}
            />
            <p className={styles.fieldHint}>
              即梦视频3.0，支持文生视频、图生视频（首帧）、图生视频（首尾帧）
            </p>
          </div>
        )}

        {provider === 'minimax' && (
          <div className={styles.field}>
            <label>Group ID</label>
            <input
              type="text"
              value={config.groupId || ''}
              onChange={handleGroupIdChange}
              placeholder="输入 MiniMax Group ID"
            />
            <p className={styles.fieldHint}>
              MiniMax TTS 需要 API Key 和 Group ID 进行鉴权
            </p>
          </div>
        )}

        {provider === 'minimax' && (
          <div className={styles.field}>
            <label>模型</label>
            <CustomSelect
              value={config.model || 'speech-2.8-turbo'}
              options={modelOptions}
              onChange={(value) => onUpdate({ model: value })}
            />
            <p className={styles.fieldHint}>
              speech-2.8-turbo 速度快，speech-2.8-hd 音质更好
            </p>
          </div>
        )}

        <div className={styles.field}>
          <label>API 端点</label>
          <input
            type="text"
            value={config.endpoint || ''}
            onChange={handleEndpointChange}
            placeholder="输入 API 端点地址"
          />
        </div>

        {(provider === 'kling' || provider === 'gemini12ai' || provider === 'yunwu') && (
          <div className={styles.field}>
            <label>图片模型</label>
            {provider === 'gemini12ai' ? (
              <CustomSelect
                value={config.model || 'gemini-3.1-flash-image-preview'}
                options={geminiModelOptions}
                onChange={(value) => onUpdate({ model: value })}
              />
            ) : provider === 'yunwu' ? (
              <CustomSelect
                value={config.model || 'gemini-3-pro-image-preview'}
                options={yunwuImageModelOptions}
                onChange={(value) => onUpdate({ model: value })}
              />
            ) : (
              <input
                type="text"
                value={config.model || ''}
                onChange={handleModelChange}
                placeholder="输入模型名称"
              />
            )}
          </div>
        )}

        {(provider === 'gemini12ai' || provider === 'yunwu' || provider === 'volcark') && (
          <div className={styles.field}>
            <label>视频模型</label>
            {provider === 'yunwu' ? (
              <CustomSelect
                value={config.videoModel || 'viduq3-turbo'}
                options={yunwuVideoModelOptions}
                onChange={(value) => {
                  const isVeo = value.startsWith('veo')
                  const isGrok = value.startsWith('grok')
                  const is4k = value.includes('4k') || value.includes('4K')
                  const updates: Partial<ApiConfig> = { videoModel: value }
                  if (is4k) {
                    updates.resolution = '4k'
                  } else if ((isVeo || isGrok) && config.resolution === '540p') {
                    updates.resolution = '720p'
                  } else if ((isVeo || isGrok) && config.resolution === '4k') {
                    updates.resolution = '720p'
                  } else if (!isVeo && !isGrok && config.resolution === '4k') {
                    updates.resolution = '720p'
                  }
                  onUpdate(updates)
                }}
              />
            ) : provider === 'volcark' ? (
              <input
                type="text"
                value={config.videoModel || ''}
                onChange={(e) => onUpdate({ videoModel: e.target.value })}
                placeholder="输入 Endpoint ID，如 ep-2026040818xxxx-xxxxx"
              />
            ) : (
              <CustomSelect
                value={config.videoModel || 'seedance2-5s'}
                options={videoModelOptions}
                onChange={(value) => onUpdate({ videoModel: value })}
              />
            )}
            {provider === 'yunwu' && (
              <p className={styles.fieldHint}>
                Vidu: viduq3-turbo 速度快，viduq3-pro 质量高；Veo: veo3.1-fast 性价比高，veo3.1-4k 支持4K
              </p>
            )}
            {provider === 'gemini12ai' && (
              <p className={styles.fieldHint}>
                Seedance 2.0 支持文生视频、图生视频、首尾帧模式
              </p>
            )}
            {provider === 'volcark' && (
              <p className={styles.fieldHint}>
                在火山方舟控制台创建推理接入点，将 Endpoint ID 填入此处
              </p>
            )}
          </div>
        )}

        {provider === 'volcark' && (
          <div className={styles.field}>
            <label>AI MediaKit API Key (画质增强)</label>
            <input
              type="password"
              value={amkApiKey}
              onChange={(e) => setAmkApiKey(e.target.value)}
              placeholder="输入 AI MediaKit API Key"
            />
            <p className={styles.fieldHint}>
              用于视频画质增强（超分），在火山引擎 AI MediaKit 控制台获取
            </p>
          </div>
        )}

        {provider === 'volcark' && (
          <div className={styles.tosSection}>
            <h4>TOS 存储配置</h4>
            <p className={styles.sectionHint}>
              对口型功能和Seedance视频生成需要将图片上传到火山引擎TOS获取公网URL
            </p>
            <div className={styles.field}>
              <label>TOS 节点</label>
              <input
                type="text"
                value={config.tosEndpoint || ''}
                onChange={(e) => onUpdate({ tosEndpoint: e.target.value })}
                placeholder="如: https://tos-cn-beijing.volces.com"
              />
            </div>
            <div className={styles.field}>
              <label>S3 节点</label>
              <input
                type="text"
                value={config.s3Endpoint || ''}
                onChange={(e) => onUpdate({ s3Endpoint: e.target.value })}
                placeholder="如: https://tos-s3-cn-beijing.volces.com"
              />
            </div>
            <div className={styles.field}>
              <label>存储桶名称 (Bucket)</label>
              <input
                type="text"
                value={config.bucket || ''}
                onChange={(e) => onUpdate({ bucket: e.target.value })}
                placeholder="如: cunchutupian"
              />
            </div>
            <div className={styles.field}>
              <label>区域 (Region)</label>
              <CustomSelect
                value={config.region || 'cn-beijing'}
                options={tosRegionOptions}
                onChange={(value) => onUpdate({ region: value })}
              />
            </div>
            <div className={styles.field}>
              <label>Access Key（可选，公开桶可留空）</label>
              <input
                type="text"
                value={config.accessKey || ''}
                onChange={(e) => onUpdate({ accessKey: e.target.value })}
                placeholder="公开桶可留空"
              />
            </div>
            <div className={styles.field}>
              <label>Secret Key（可选，公开桶可留空）</label>
              <input
                type="password"
                value={config.secretKey || ''}
                onChange={(e) => onUpdate({ secretKey: e.target.value })}
                placeholder="公开桶可留空"
              />
            </div>
          </div>
        )}

        {provider === 'yunwu' && (
          <div className={styles.field}>
            <label>视频分辨率</label>
            <CustomSelect
              value={config.resolution || '720p'}
              options={yunwuResolutionOptions}
              onChange={(value) => onUpdate({ resolution: value })}
            />
            <p className={styles.fieldHint}>
              {(config.videoModel || '').startsWith('veo')
                ? (config.videoModel || '').includes('4k')
                  ? '4K 分辨率由模型决定'
                  : 'Veo 模型支持 720p 和 1080p'
                : '默认720p，可选540p或1080p'}
            </p>
          </div>
        )}
      </div>

      {provider === 'runninghub' && (
        <>
          <div className={styles.apiSelectorSection}>
            <h4>API 选择</h4>
            <div className={styles.apiSelectorGrid}>
              <div className={styles.field}>
                <label>图生图 API</label>
                <CustomSelect
                  value={runningHubImageMappingId || ''}
                  options={imageMappingOptions}
                  onChange={handleImageMappingChange}
                />
              </div>
              <div className={styles.field}>
                <label>图生视频 API</label>
                <CustomSelect
                  value={runningHubVideoMappingId || ''}
                  options={videoMappingOptions}
                  onChange={handleVideoMappingChange}
                />
              </div>
              <div className={styles.field}>
                <label>视角转换 API</label>
                <CustomSelect
                  value={runningHubViewAngleMappingId || ''}
                  options={viewAngleMappingOptions}
                  onChange={handleViewAngleMappingChange}
                />
              </div>
              <div className={styles.field}>
                <label>文生图 API</label>
                <CustomSelect
                  value={runningHubText2ImageMappingId || ''}
                  options={text2ImageMappingOptions}
                  onChange={handleText2ImageMappingChange}
                />
              </div>
            </div>
          </div>
          <RunningHubMappingsSection />
        </>
      )}
    </div>
  )
})

const ApiSettingsPanel: React.FC = () => {
  const { apiConfigs, updateApiConfig } = useAppStore()
  const [activeProvider, setActiveProvider] = useState<ApiProvider>('runninghub')

  const currentConfig = apiConfigs[activeProvider]

  if (!currentConfig) {
    return (
      <>
        <div className={styles.header}>
          <h2>API 配置</h2>
        </div>
        <div className={styles.apiContent}>
          <p>加载中...</p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className={styles.header}>
        <h2>API 配置</h2>
      </div>

      <div className={styles.apiContent}>
        <div className={styles.providerTabs}>
          {API_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              className={`${styles.providerTab} ${activeProvider === provider.id ? styles.providerTabActive : ''}`}
              onClick={() => setActiveProvider(provider.id)}
            >
              <ApiIcon provider={provider.id} size={18} />
              <span>{provider.name}</span>
            </button>
          ))}
        </div>

        <div className={styles.configArea}>
          <ApiConfigSection
            provider={activeProvider}
            config={currentConfig}
            onUpdate={(config) => updateApiConfig(activeProvider, config)}
          />
        </div>
      </div>
    </>
  )
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, imageApiProvider, videoApiProvider } = useAppStore()
  const [activeTab, setActiveTab] = useState<'general' | 'api'>('api')

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.tabBar}>
          <button 
            className={`${styles.tab} ${activeTab === 'general' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('general')}
          >
            通用设置
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'api' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('api')}
          >
            API 配置
          </button>
          <div className={styles.tabSpacer} />
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {activeTab === 'general' ? (
          <SettingsPanelContent
            key={settings.theme}
            settings={settings}
            onClose={onClose}
            updateSettings={updateSettings}
            imageApiProvider={imageApiProvider}
            videoApiProvider={videoApiProvider}
          />
        ) : (
          <ApiSettingsPanel />
        )}
      </div>
    </div>
  )
}

export default SettingsPanel
