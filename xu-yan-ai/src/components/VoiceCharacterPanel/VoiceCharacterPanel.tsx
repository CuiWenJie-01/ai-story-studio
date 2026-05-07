import React, { useState, useCallback, useMemo } from 'react'
import { Users, Plus, Minus, ChevronDown } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import VoiceSelector from '../VoiceSelector'
import { MINIMAX_VOICES } from '../../utils/voices'
import styles from './VoiceCharacterPanel.module.css'

const VoiceCharacterPanel: React.FC = () => {
  const { 
    activeTask, 
    voiceCharacters, 
    addVoiceCharacter, 
    updateVoiceCharacter, 
    removeVoiceCharacter,
    favoriteVoiceIds,
    toggleFavoriteVoice,
  } = useAppStore()

  const [newCharacterName, setNewCharacterName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showVoiceSelectorFor, setShowVoiceSelectorFor] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const taskId = activeTask?.path || ''
  const characters = useMemo(() => taskId ? (voiceCharacters[taskId] || []) : [], [taskId, voiceCharacters])

  const handleAddCharacter = useCallback(() => {
    if (!taskId) {
      setAddError('请先选择任务')
      return
    }
    
    const trimmedName = newCharacterName.trim()
    if (!trimmedName) {
      setAddError('请输入角色名称')
      return
    }

    const nameExists = characters.some(c => c.name === trimmedName)
    if (nameExists) {
      setAddError('角色名称已存在')
      return
    }

    addVoiceCharacter(taskId, {
      name: trimmedName,
      voiceId: 'male-qn-qingse',
      voiceName: '青涩青年音色',
    })
    
    setNewCharacterName('')
    setAddError(null)
  }, [taskId, newCharacterName, characters, addVoiceCharacter])

  const handleStartEdit = useCallback((id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !taskId) return
    
    const trimmedName = editingName.trim()
    if (!trimmedName) return

    updateVoiceCharacter(taskId, editingId, { name: trimmedName })
    setEditingId(null)
    setEditingName('')
  }, [editingId, editingName, taskId, updateVoiceCharacter])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingName('')
  }, [])

  const handleDeleteCharacter = useCallback((id: string) => {
    if (!taskId) return
    removeVoiceCharacter(taskId, id)
  }, [taskId, removeVoiceCharacter])

  const handleVoiceSelect = useCallback((characterId: string, voiceId: string) => {
    if (!taskId) return
    const voice = MINIMAX_VOICES.find(v => v.id === voiceId)
    if (voice) {
      updateVoiceCharacter(taskId, characterId, { 
        voiceId: voice.id, 
        voiceName: voice.name 
      })
    }
    setShowVoiceSelectorFor(null)
  }, [taskId, updateVoiceCharacter])

  if (!activeTask) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Users size={18} />
          <span>角色管理</span>
        </div>
        <div className={styles.emptyState}>
          <span>请先选择任务</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Users size={18} />
        <span>角色管理</span>
        <span className={styles.count}>{characters.length}</span>
      </div>

      <div className={styles.addSection}>
        <div className={styles.addInputWrapper}>
          <input
            type="text"
            value={newCharacterName}
            onChange={(e) => {
              setNewCharacterName(e.target.value)
              setAddError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddCharacter()
              }
            }}
            placeholder="输入角色名称..."
            className={styles.addInput}
          />
          <button 
            className={styles.addBtn}
            onClick={handleAddCharacter}
            disabled={!newCharacterName.trim()}
            title="添加角色"
          >
            <Plus size={16} />
          </button>
        </div>
        {addError && (
          <div className={styles.addError}>{addError}</div>
        )}
      </div>

      <div className={styles.characterList}>
        {characters.length === 0 ? (
          <div className={styles.emptyList}>
            <span>暂无角色，请添加</span>
          </div>
        ) : (
          characters.map((character) => (
            <div key={character.id} className={styles.characterItem}>
              <div className={styles.characterRow}>
                <div className={styles.characterInfo}>
                  {editingId === character.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit()
                        if (e.key === 'Escape') handleCancelEdit()
                      }}
                      onBlur={handleSaveEdit}
                      className={styles.editInput}
                      autoFocus
                    />
                  ) : (
                    <span 
                      className={styles.characterName}
                      onDoubleClick={() => handleStartEdit(character.id, character.name)}
                      title="双击编辑名称"
                    >
                      {character.name}
                    </span>
                  )}
                </div>

                <div className={styles.voiceSelectorWrapper}>
                  <button
                    className={styles.voiceSelectorTrigger}
                    onClick={() => setShowVoiceSelectorFor(character.id)}
                  >
                    <span className={styles.voiceName}>{character.voiceName}</span>
                    <ChevronDown size={14} />
                  </button>
                </div>

                <div className={styles.characterActions}>
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleDeleteCharacter(character.id)}
                    title="删除角色"
                  >
                    <Minus size={14} />
                  </button>
                </div>
              </div>

              {showVoiceSelectorFor === character.id && (
                <VoiceSelector
                  isOpen={true}
                  onClose={() => setShowVoiceSelectorFor(null)}
                  voices={MINIMAX_VOICES}
                  selectedVoiceId={character.voiceId}
                  favoriteVoiceIds={favoriteVoiceIds}
                  onSelect={(voiceId) => handleVoiceSelect(character.id, voiceId)}
                  onToggleFavorite={toggleFavoriteVoice}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default VoiceCharacterPanel
