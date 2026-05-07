import React, { useCallback, useState, memo, useMemo } from 'react'
import { Plus, Minus, Play, Music, Square, ChevronDown, Users } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import VoiceSelector from '../VoiceSelector'
import { MINIMAX_VOICES } from '../../utils/voices'
import type { WorkItem, VoiceCharacter } from '../../types'
import styles from './VoiceWorkCard.module.css'

interface VoiceWorkCardProps {
  item: WorkItem
  isActive: boolean
  onClick: () => void
}

const areEqual = (prevProps: VoiceWorkCardProps, nextProps: VoiceWorkCardProps) => {
  const prev = prevProps.item
  const next = nextProps.item
  
  if (prevProps.isActive !== nextProps.isActive) return false
  if (prevProps.item.id !== nextProps.item.id) return false
  
  if (prev.voiceState?.status !== next.voiceState?.status) return false
  if (prev.voiceState?.progress !== next.voiceState?.progress) return false
  if (prev.voiceState?.message !== next.voiceState?.message) return false
  if (prev.voiceState?.text !== next.voiceState?.text) return false
  if (prev.voiceState?.voiceId !== next.voiceState?.voiceId) return false
  if (prev.voiceState?.speed !== next.voiceState?.speed) return false
  if (prev.voiceState?.volume !== next.voiceState?.volume) return false
  if (prev.voiceState?.pitch !== next.voiceState?.pitch) return false
  if (prev.voiceState?.characterId !== next.voiceState?.characterId) return false
  if (prev.voiceState?.characterName !== next.voiceState?.characterName) return false
  
  if (prev.generatedAudio?.id !== next.generatedAudio?.id) return false
  if (prev.generatedAudio?.url !== next.generatedAudio?.url) return false
  if (prev.generatedAudio?.timestamp !== next.generatedAudio?.timestamp) return false
  
  if (prev.excelData?.novelText !== next.excelData?.novelText) return false
  
  return true
}

const VoiceWorkCard = memo<VoiceWorkCardProps>(({ item, isActive, onClick }) => {
  const { 
    updateWorkItem, 
    removeWorkItem, 
    addWorkItemAfter,
    activeTask,
    favoriteVoiceIds,
    toggleFavoriteVoice,
    voiceCharacters,
  } = useAppStore(
    useShallow((state) => ({
      updateWorkItem: state.updateWorkItem,
      removeWorkItem: state.removeWorkItem,
      addWorkItemAfter: state.addWorkItemAfter,
      activeTask: state.activeTask,
      favoriteVoiceIds: state.favoriteVoiceIds,
      toggleFavoriteVoice: state.toggleFavoriteVoice,
      voiceCharacters: state.voiceCharacters,
    }))
  )

  const [showVoiceSelector, setShowVoiceSelector] = useState(false)
  const [showCharacterSelector, setShowCharacterSelector] = useState(false)
  const isGenerating = item.voiceState?.status === 'processing'

  const charCount = item.voiceState?.text?.length || 0
  const maxChars = 10000
  
  const taskId = activeTask?.path || ''
  const characters = useMemo(() => taskId ? (voiceCharacters[taskId] || []) : [], [taskId, voiceCharacters])
  
  const selectedVoice = MINIMAX_VOICES.find(v => v.id === item.voiceState?.voiceId) || MINIMAX_VOICES[0]
  const selectedCharacter = characters.find(c => c.id === item.voiceState?.characterId)

  const audioSrc = useMemo(() => {
    if (!item.generatedAudio?.url) return null
    const url = item.generatedAudio.url
    const timestamp = item.generatedAudio.timestamp || Date.now()
    const separator = url.includes('?') ? '&' : '?'
    const urlWithTimestamp = `${url}${separator}t=${timestamp}`
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return urlWithTimestamp
    }
    return convertFileSrc(url) + `?t=${timestamp}`
  }, [item.generatedAudio?.url, item.generatedAudio?.timestamp])

  const handleTextChange = useCallback((text: string) => {
    updateWorkItem(item.id, {
      voiceState: {
        ...item.voiceState,
        text: text.slice(0, maxChars),
        voiceId: item.voiceState?.voiceId || 'male-qn-qingse',
        speed: item.voiceState?.speed || 1,
        volume: item.voiceState?.volume || 1,
        pitch: item.voiceState?.pitch || 0,
        status: item.voiceState?.status || 'idle',
        progress: item.voiceState?.progress || 0,
        message: item.voiceState?.message || '',
      }
    })
  }, [item.id, item.voiceState, updateWorkItem])

  const handleVoiceSelect = useCallback((voiceId: string) => {
    updateWorkItem(item.id, {
      voiceState: {
        ...item.voiceState,
        voiceId,
        text: item.voiceState?.text || '',
        speed: item.voiceState?.speed || 1,
        volume: item.voiceState?.volume || 1,
        pitch: item.voiceState?.pitch || 0,
        status: item.voiceState?.status || 'idle',
        progress: item.voiceState?.progress || 0,
        message: item.voiceState?.message || '',
      }
    })
    setShowVoiceSelector(false)
  }, [item.id, item.voiceState, updateWorkItem])

  const handleCharacterSelect = useCallback((character: VoiceCharacter | null) => {
    if (character) {
      updateWorkItem(item.id, {
        voiceState: {
          ...item.voiceState,
          voiceId: character.voiceId,
          characterId: character.id,
          characterName: character.name,
          characterIndex: characters.filter(c => c.id === character.id).findIndex(() => true) + 1,
          text: item.voiceState?.text || item.excelData?.novelText || '',
          speed: item.voiceState?.speed || 1,
          volume: item.voiceState?.volume || 1,
          pitch: item.voiceState?.pitch || 0,
          status: item.voiceState?.status || 'idle',
          progress: item.voiceState?.progress || 0,
          message: item.voiceState?.message || '',
        }
      })
    } else {
      updateWorkItem(item.id, {
        voiceState: {
          ...item.voiceState,
          characterId: undefined,
          characterName: undefined,
          characterIndex: undefined,
          text: item.voiceState?.text || item.excelData?.novelText || '',
          voiceId: item.voiceState?.voiceId || 'male-qn-qingse',
          speed: item.voiceState?.speed || 1,
          volume: item.voiceState?.volume || 1,
          pitch: item.voiceState?.pitch || 0,
          status: item.voiceState?.status || 'idle',
          progress: item.voiceState?.progress || 0,
          message: item.voiceState?.message || '',
        }
      })
    }
    setShowCharacterSelector(false)
  }, [item.id, item.voiceState, item.excelData?.novelText, characters, updateWorkItem])

  const handleSpeedChange = useCallback((speed: number) => {
    updateWorkItem(item.id, {
      voiceState: {
        ...item.voiceState,
        speed,
        text: item.voiceState?.text || '',
        voiceId: item.voiceState?.voiceId || 'male-qn-qingse',
        volume: item.voiceState?.volume || 1,
        pitch: item.voiceState?.pitch || 0,
        status: item.voiceState?.status || 'idle',
        progress: item.voiceState?.progress || 0,
        message: item.voiceState?.message || '',
      }
    })
  }, [item.id, item.voiceState, updateWorkItem])

  const handleVolumeChange = useCallback((volume: number) => {
    updateWorkItem(item.id, {
      voiceState: {
        ...item.voiceState,
        volume,
        text: item.voiceState?.text || '',
        voiceId: item.voiceState?.voiceId || 'male-qn-qingse',
        speed: item.voiceState?.speed || 1,
        pitch: item.voiceState?.pitch || 0,
        status: item.voiceState?.status || 'idle',
        progress: item.voiceState?.progress || 0,
        message: item.voiceState?.message || '',
      }
    })
  }, [item.id, item.voiceState, updateWorkItem])

  const handlePitchChange = useCallback((pitch: number) => {
    updateWorkItem(item.id, {
      voiceState: {
        ...item.voiceState,
        pitch,
        text: item.voiceState?.text || '',
        voiceId: item.voiceState?.voiceId || 'male-qn-qingse',
        speed: item.voiceState?.speed || 1,
        volume: item.voiceState?.volume || 1,
        status: item.voiceState?.status || 'idle',
        progress: item.voiceState?.progress || 0,
        message: item.voiceState?.message || '',
      }
    })
  }, [item.id, item.voiceState, updateWorkItem])

  const handleGenerate = useCallback(async () => {
    const currentState = useAppStore.getState()
    const currentItem = currentState.workItems.find(i => i.id === item.id)
    const currentVoiceState = currentItem?.voiceState
    
    if (!activeTask) {
      updateWorkItem(item.id, {
        voiceState: {
          ...currentVoiceState,
          status: 'error',
          progress: 0,
          message: '请先选择任务',
          error: '请先选择任务',
          text: currentVoiceState?.text || '',
          voiceId: currentVoiceState?.voiceId || 'male-qn-qingse',
          speed: currentVoiceState?.speed || 1,
          volume: currentVoiceState?.volume || 1,
          pitch: currentVoiceState?.pitch || 0,
        }
      })
      return
    }

    if (!currentVoiceState?.text?.trim()) {
      updateWorkItem(item.id, {
        voiceState: {
          ...currentVoiceState,
          status: 'error',
          progress: 0,
          message: '请输入要合成的文本',
          error: '请输入要合成的文本',
          text: currentVoiceState?.text || '',
          voiceId: currentVoiceState?.voiceId || 'male-qn-qingse',
          speed: currentVoiceState?.speed || 1,
          volume: currentVoiceState?.volume || 1,
          pitch: currentVoiceState?.pitch || 0,
        }
      })
      return
    }

    const minimaxConfig = currentState.apiConfigs.minimax
    if (!minimaxConfig.apiKey || !minimaxConfig.groupId) {
      updateWorkItem(item.id, {
        voiceState: {
          ...currentVoiceState,
          status: 'error',
          progress: 0,
          message: '请先在设置中配置 MiniMax API Key 和 Group ID',
          error: '请先在设置中配置 MiniMax API Key 和 Group ID',
          text: currentVoiceState?.text || '',
          voiceId: currentVoiceState?.voiceId || 'male-qn-qingse',
          speed: currentVoiceState?.speed || 1,
          volume: currentVoiceState?.volume || 1,
          pitch: currentVoiceState?.pitch || 0,
        }
      })
      return
    }

    const voiceId = currentVoiceState?.voiceId || 'male-qn-qingse'
    const voiceName = MINIMAX_VOICES.find(v => v.id === voiceId)?.name || '青涩青年音色'

    updateWorkItem(item.id, {
      voiceState: {
        ...currentVoiceState,
        status: 'processing',
        progress: 10,
        message: '正在连接 MiniMax TTS 服务...',
        text: currentVoiceState?.text || '',
        voiceId,
        speed: currentVoiceState?.speed || 1,
        volume: currentVoiceState?.volume || 1,
        pitch: currentVoiceState?.pitch || 0,
      }
    })

    try {
      let outputPath: string
      
      if (currentVoiceState?.characterId && currentVoiceState.characterName) {
        const characterName = currentVoiceState.characterName
        const textPreview = (currentVoiceState?.text || '').trim().slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')
        const characterIndex = currentVoiceState?.characterIndex || 1
        outputPath = `${activeTask.path}/Voice/${characterName}-${characterIndex}：${textPreview}.mp3`
      } else {
        outputPath = `${activeTask.path}/Voice/镜头${item.shotNumber}_Voice.mp3`
      }

      const result = await invoke<{
        success: boolean
        path: string | null
        error: string | null
      }>('minimax_text_to_speech', {
        request: {
          apiKey: minimaxConfig.apiKey,
          groupId: minimaxConfig.groupId,
          text: currentVoiceState?.text || '',
          voiceId,
          speed: currentVoiceState?.speed || 1,
          volume: currentVoiceState?.volume || 1,
          pitch: currentVoiceState?.pitch || 0,
          outputPath: outputPath,
        }
      })

      if (result.success && result.path) {
        updateWorkItem(item.id, {
          voiceState: {
            ...currentVoiceState,
            status: 'completed',
            progress: 100,
            message: '语音合成完成',
            text: currentVoiceState?.text || '',
            voiceId,
            speed: currentVoiceState?.speed || 1,
            volume: currentVoiceState?.volume || 1,
            pitch: currentVoiceState?.pitch || 0,
          },
          generatedAudio: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            url: result.path,
            path: result.path,
            timestamp: Date.now(),
            text: currentVoiceState?.text || '',
            voiceId,
            voiceName,
            duration: Math.ceil((currentVoiceState?.text?.length || 0) / 5),
          }
        })
      } else {
        throw new Error(result.error || '语音合成失败')
      }
    } catch (error) {
      console.error('[VoiceWorkCard] TTS error:', error)
      updateWorkItem(item.id, {
        voiceState: {
          ...currentVoiceState,
          status: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : '语音合成失败',
          error: error instanceof Error ? error.message : '语音合成失败',
          text: currentVoiceState?.text || '',
          voiceId,
          speed: currentVoiceState?.speed || 1,
          volume: currentVoiceState?.volume || 1,
          pitch: currentVoiceState?.pitch || 0,
        }
      })
    }
  }, [item.id, item.shotNumber, activeTask, updateWorkItem])

  const handleCancel = useCallback(() => {
    updateWorkItem(item.id, {
      voiceState: {
        ...item.voiceState,
        status: 'idle',
        progress: 0,
        message: '已取消',
        text: item.voiceState?.text || '',
        voiceId: item.voiceState?.voiceId || 'male-qn-qingse',
        speed: item.voiceState?.speed || 1,
        volume: item.voiceState?.volume || 1,
        pitch: item.voiceState?.pitch || 0,
      }
    })
  }, [item.id, item.voiceState, updateWorkItem])

  const handleAddShot = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    addWorkItemAfter(item.id, 'voice')
  }, [item.id, addWorkItemAfter])

  const handleRemoveShot = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    removeWorkItem(item.id)
  }, [item.id, removeWorkItem])

  return (
    <div
      className={`${styles.card} ${isActive ? styles.active : ''}`}
      onClick={onClick}
      data-shot-number={item.shotNumber}
    >
      <div className={styles.cardHeader}>
        <div className={styles.shotInfo}>
          <span className={styles.typeIcon}>
            <Music size={16} />
          </span>
          <span className={styles.shotNumber}>
            {item.voiceState?.characterName ? (
              <>
                <span className={styles.characterName}>{item.voiceState.characterName}</span>
                {item.voiceState.characterIndex && (
                  <span className={styles.characterIndex}>-{item.voiceState.characterIndex}</span>
                )}
              </>
            ) : (
              `#${String(item.shotNumber)}`
            )}
          </span>
        </div>
        <p className={styles.novelText}>{item.excelData?.novelText || ''}</p>
        <div className={styles.headerActions}>
          <button 
            className={styles.addShotBtn}
            onClick={handleAddShot}
            title="添加镜头"
          >
            <Plus size={14} />
          </button>
          <button 
            className={styles.removeShotBtn}
            onClick={handleRemoveShot}
            title="删除镜头"
          >
            <Minus size={14} />
          </button>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.leftSection}>
          <div className={styles.sectionTitle}>
            文本内容 <span className={styles.charCount}>{charCount}/{maxChars}</span>
          </div>
          <textarea
            value={item.voiceState?.text || item.excelData?.novelText || ''}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="输入要合成的文本内容..."
            className={styles.textarea}
            rows={8}
            onClick={(e) => e.stopPropagation()}
            disabled={isGenerating}
          />
        </div>

        <div className={styles.optionsSection}>
          <div className={styles.voiceSelectorWrapper}>
            <div className={styles.voiceSelectorLabel}>角色选择</div>
            <button
              className={styles.voiceSelectorTrigger}
              onClick={(e) => { e.stopPropagation(); setShowCharacterSelector(!showCharacterSelector) }}
              disabled={isGenerating}
            >
              <div className={styles.voiceInfo}>
                <span className={styles.voiceName}>
                  {selectedCharacter ? selectedCharacter.name : '选择角色'}
                </span>
                <span className={styles.voiceDesc}>
                  {selectedCharacter ? selectedCharacter.voiceName : '点击选择角色管理中的角色'}
                </span>
              </div>
              <ChevronDown size={16} />
            </button>
            
            {showCharacterSelector && (
              <div className={styles.characterDropdown}>
                <div 
                  className={`${styles.characterOption} ${!selectedCharacter ? styles.characterOptionSelected : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleCharacterSelect(null) }}
                >
                  <div className={styles.characterOptionContent}>
                    <span className={styles.characterOptionName}>不选择角色</span>
                    <span className={styles.characterOptionDesc}>使用默认镜头号</span>
                  </div>
                </div>
                {characters.map((character) => (
                  <div 
                    key={character.id}
                    className={`${styles.characterOption} ${selectedCharacter?.id === character.id ? styles.characterOptionSelected : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleCharacterSelect(character) }}
                  >
                    <div className={styles.characterOptionIcon}>
                      <Users size={14} />
                    </div>
                    <div className={styles.characterOptionContent}>
                      <span className={styles.characterOptionName}>{character.name}</span>
                      <span className={styles.characterOptionDesc}>{character.voiceName}</span>
                    </div>
                  </div>
                ))}
                {characters.length === 0 && (
                  <div className={styles.emptyCharacter}>
                    <span>暂无角色，请在左侧添加</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={styles.voiceSelectorWrapper}>
            <div className={styles.voiceSelectorLabel}>音色选择</div>
            <button
              className={styles.voiceSelectorTrigger}
              onClick={(e) => { e.stopPropagation(); setShowVoiceSelector(true) }}
              disabled={isGenerating}
            >
              <div className={styles.voiceInfo}>
                <span className={styles.voiceName}>{selectedVoice.name}</span>
                <span className={styles.voiceDesc}>{selectedVoice.description}</span>
              </div>
              <ChevronDown size={16} />
            </button>
          </div>

          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabel}>
              <span>语速</span>
              <span className={styles.sliderValue}>{item.voiceState?.speed || 1}x</span>
            </div>
            <input
              type="range"
              className={styles.slider}
              min="0.5"
              max="2"
              step="0.1"
              value={item.voiceState?.speed || 1}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              disabled={isGenerating}
            />
          </div>

          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabel}>
              <span>音量</span>
              <span className={styles.sliderValue}>{Math.round((item.voiceState?.volume || 1) * 100)}%</span>
            </div>
            <input
              type="range"
              className={styles.slider}
              min="0"
              max="2"
              step="0.1"
              value={item.voiceState?.volume || 1}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              disabled={isGenerating}
            />
          </div>

          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabel}>
              <span>音调</span>
              <span className={styles.sliderValue}>{item.voiceState?.pitch || 0}</span>
            </div>
            <input
              type="range"
              className={styles.slider}
              min="-12"
              max="12"
              step="1"
              value={item.voiceState?.pitch || 0}
              onChange={(e) => handlePitchChange(parseInt(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              disabled={isGenerating}
            />
          </div>
        </div>

        <div className={styles.rightSection}>
          <div className={styles.sectionTitle}>音频预览</div>

          <div className={styles.resultArea}>
            {item.generatedAudio && audioSrc ? (
              <div className={styles.resultPreview}>
                <audio 
                  key={item.generatedAudio.timestamp || item.generatedAudio.id}
                  className={styles.audioPlayer}
                  controls
                  src={audioSrc}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className={styles.audioInfo}>
                  <span className={styles.audioInfoText}>
                    {item.generatedAudio.voiceName} · {item.generatedAudio.duration}秒
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.emptyResult}>
                <Music size={32} />
                <span>等待生成</span>
              </div>
            )}
          </div>

          <div className={styles.generateBtnWrapper}>
            <button
              className={styles.generateBtn}
              onClick={(e) => { e.stopPropagation(); handleGenerate() }}
              disabled={isGenerating || !(item.voiceState?.text || item.excelData?.novelText)?.trim()}
            >
              {isGenerating ? (
                <>
                  <span className={styles.spinner} />
                  {item.voiceState?.message}
                </>
              ) : (
                <>
                  <Play size={14} />
                  开始合成
                </>
              )}
            </button>

            {isGenerating && (
              <button
                className={styles.cancelBtn}
                onClick={(e) => { e.stopPropagation(); handleCancel() }}
              >
                <Square size={12} />
                取消
              </button>
            )}
          </div>

          {isGenerating && (
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${item.voiceState?.progress || 0}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <VoiceSelector
        isOpen={showVoiceSelector}
        onClose={() => setShowVoiceSelector(false)}
        voices={MINIMAX_VOICES}
        selectedVoiceId={item.voiceState?.voiceId || 'male-qn-qingse'}
        favoriteVoiceIds={favoriteVoiceIds}
        onSelect={handleVoiceSelect}
        onToggleFavorite={toggleFavoriteVoice}
      />
    </div>
  )
}, areEqual)

VoiceWorkCard.displayName = 'VoiceWorkCard'

export default VoiceWorkCard
