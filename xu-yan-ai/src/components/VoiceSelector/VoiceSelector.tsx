import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { X, Search, Star, Heart, Play, Square, Loader2 } from 'lucide-react'
import type { VoiceVoice } from '../../types'
import styles from './VoiceSelector.module.css'

interface VoiceSelectorProps {
  isOpen: boolean
  onClose: () => void
  voices: VoiceVoice[]
  selectedVoiceId: string
  favoriteVoiceIds: string[]
  onSelect: (voiceId: string) => void
  onToggleFavorite: (voiceId: string) => void
}

const sanitizeFileName = (id: string) => {
  return id.replace(/[ ():\/\\]/g, '_').replace(/_+/g, '_')
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  isOpen,
  onClose,
  voices,
  selectedVoiceId,
  favoriteVoiceIds,
  onSelect,
  onToggleFavorite,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female' | 'neutral'>('all')
  const [tempSelectedId, setTempSelectedId] = useState<string>(selectedVoiceId)
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setTempSelectedId(selectedVoiceId)
      setSearchQuery('')
      setGenderFilter('all')
    }
  }, [isOpen, selectedVoiceId])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const filteredVoices = useMemo(() => {
    let result = activeTab === 'favorites' 
      ? voices.filter(v => favoriteVoiceIds.includes(v.id))
      : voices

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(v => 
        v.name.toLowerCase().includes(query) || 
        v.description.toLowerCase().includes(query)
      )
    }

    if (genderFilter !== 'all') {
      result = result.filter(v => v.gender === genderFilter)
    }

    return result
  }, [voices, activeTab, favoriteVoiceIds, searchQuery, genderFilter])

  const favoriteCount = favoriteVoiceIds.length
  const selectedVoice = voices.find(v => v.id === tempSelectedId)

  const handleVoiceClick = useCallback((voiceId: string) => {
    setTempSelectedId(voiceId)
  }, [])

  const handleFavoriteClick = useCallback((e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation()
    onToggleFavorite(voiceId)
  }, [onToggleFavorite])

  const handleConfirm = useCallback(() => {
    if (tempSelectedId) {
      onSelect(tempSelectedId)
      onClose()
    }
  }, [tempSelectedId, onSelect, onClose])

  const handlePlayPreview = useCallback(async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation()
    
    if (playingVoiceId === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingVoiceId(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setLoadingVoiceId(voiceId)
    
    try {
      const safeFileName = sanitizeFileName(voiceId)
      const audio = new Audio(`/voice_previews/${safeFileName}.mp3`)
      audioRef.current = audio
      
      audio.oncanplaythrough = () => {
        setLoadingVoiceId(null)
        setPlayingVoiceId(voiceId)
        audio.play()
      }
      
      audio.onended = () => {
        setPlayingVoiceId(null)
        audioRef.current = null
      }
      
      audio.onerror = () => {
        setLoadingVoiceId(null)
        setPlayingVoiceId(null)
        console.error(`[VoiceSelector] 无法加载音频: ${voiceId}`)
      }
      
      audio.load()
    } catch (error) {
      setLoadingVoiceId(null)
      console.error('[VoiceSelector] 播放失败:', error)
    }
  }, [playingVoiceId])

  const getGenderIcon = (gender: string) => {
    switch (gender) {
      case 'male': return '👨'
      case 'female': return '👩'
      default: return '🎤'
    }
  }

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingVoiceId(null)
      onClose()
    }
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className={styles.voiceSelectorOverlay} onClick={handleOverlayClick}>
      <div className={styles.voiceSelectorModal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>选择音色</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'all' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            全部音色
            <span className={styles.tabBadge}>{voices.length}</span>
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'favorites' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            收藏音色
            <span className={styles.tabBadge}>{favoriteCount}</span>
          </button>
        </div>

        <div className={styles.searchBox}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜索音色名称或描述..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.genderFilter}>
          <button 
            className={`${styles.genderFilterBtn} ${genderFilter === 'all' ? styles.genderFilterBtnActive : ''}`}
            onClick={() => setGenderFilter('all')}
          >
            全部
          </button>
          <button 
            className={`${styles.genderFilterBtn} ${genderFilter === 'male' ? styles.genderFilterBtnActive : ''}`}
            onClick={() => setGenderFilter('male')}
          >
            👨 男声
          </button>
          <button 
            className={`${styles.genderFilterBtn} ${genderFilter === 'female' ? styles.genderFilterBtnActive : ''}`}
            onClick={() => setGenderFilter('female')}
          >
            👩 女声
          </button>
          <button 
            className={`${styles.genderFilterBtn} ${genderFilter === 'neutral' ? styles.genderFilterBtnActive : ''}`}
            onClick={() => setGenderFilter('neutral')}
          >
            🎤 其他
          </button>
        </div>

        <div className={styles.voiceList}>
          {filteredVoices.length > 0 ? (
            <div className={styles.voiceGrid}>
              {filteredVoices.map((voice) => (
                <div
                  key={voice.id}
                  className={`${styles.voiceCard} ${tempSelectedId === voice.id ? styles.voiceCardSelected : ''}`}
                  onClick={() => handleVoiceClick(voice.id)}
                >
                  <div className={styles.voiceCardIcon}>
                    {getGenderIcon(voice.gender)}
                  </div>
                  <div className={styles.voiceCardInfo}>
                    <div className={styles.voiceCardName}>{voice.name}</div>
                    <div className={styles.voiceCardDesc}>{voice.description}</div>
                  </div>
                  <div className={styles.voiceCardActions}>
                    <button
                      className={styles.playBtn}
                      onClick={e => handlePlayPreview(e, voice.id)}
                      title={playingVoiceId === voice.id ? '停止' : '试听'}
                    >
                      {loadingVoiceId === voice.id ? (
                        <Loader2 size={14} className={styles.spinning} />
                      ) : playingVoiceId === voice.id ? (
                        <Square size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                    <button
                      className={`${styles.favoriteBtn} ${favoriteVoiceIds.includes(voice.id) ? styles.favoriteBtnFavorited : ''}`}
                      onClick={e => handleFavoriteClick(e, voice.id)}
                      title={favoriteVoiceIds.includes(voice.id) ? '取消收藏' : '添加收藏'}
                    >
                      <Star 
                        size={14} 
                        fill={favoriteVoiceIds.includes(voice.id) ? 'currentColor' : 'none'}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                {activeTab === 'favorites' ? (
                  <Heart size={48} />
                ) : (
                  <Search size={48} />
                )}
              </div>
              <div className={styles.emptyText}>
                {activeTab === 'favorites' 
                  ? '还没有收藏的音色，点击音色右侧的星星添加收藏'
                  : '没有找到匹配的音色'
                }
              </div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <div className={styles.selectedInfo}>
            {selectedVoice ? (
              <>
                已选择: <span className={styles.selectedVoiceName}>{selectedVoice.name}</span>
              </>
            ) : (
              '请选择一个音色'
            )}
          </div>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={!tempSelectedId}
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  )
}

export default VoiceSelector
