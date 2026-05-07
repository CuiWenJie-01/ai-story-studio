import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Search, Check } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import styles from './PromptSelector.module.css'

interface PromptSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (prompt: string) => void
  anchorEl?: HTMLElement | null
}

const PromptSelector: React.FC<PromptSelectorProps> = ({ 
  isOpen, 
  onClose, 
  onSelect,
  anchorEl 
}) => {
  const { presets } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const getPosition = useCallback(() => {
    if (!anchorEl) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }

    const rect = anchorEl.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    
    let top = rect.bottom + 8
    let left = rect.left
    
    const dropdownWidth = 280
    const dropdownHeight = 320

    if (left + dropdownWidth > viewportWidth - 16) {
      left = viewportWidth - dropdownWidth - 16
    }
    
    if (left < 16) {
      left = 16
    }

    if (top + dropdownHeight > viewportHeight - 16) {
      top = rect.top - dropdownHeight - 8
    }

    if (top < 16) {
      top = 16
    }

    return { top, left, transform: 'none' }
  }, [anchorEl])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  const handleSelect = useCallback((prompt: string) => {
    onSelect(prompt)
    onClose()
  }, [onSelect, onClose])

  if (!isOpen) return null

  const position = getPosition()

  return (
    <div 
      ref={containerRef}
      className={styles.dropdown}
      style={position}
      onClick={e => e.stopPropagation()}
    >
      <PromptList 
        presets={presets} 
        onSelect={handleSelect} 
      />
    </div>
  )
}

interface PromptListProps {
  presets: Array<{ id: string; name: string; prompt: string; category: string }>
  onSelect: (prompt: string) => void
}

const PromptList: React.FC<PromptListProps> = ({ presets, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredPresets = useMemo(() => {
    if (!searchTerm.trim()) return presets
    const term = searchTerm.toLowerCase()
    return presets.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.prompt.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term)
    )
  }, [presets, searchTerm])

  return (
    <>
      <div className={styles.searchBox}>
        <Search size={14} />
        <input
          type="text"
          placeholder="搜索提示词..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.list}>
        {filteredPresets.length === 0 ? (
          <div className={styles.empty}>
            {searchTerm ? '未找到匹配的提示词' : '暂无提示词'}
          </div>
        ) : (
          filteredPresets.map(preset => (
            <div
              key={preset.id}
              className={styles.item}
              onClick={() => onSelect(preset.prompt)}
            >
              <div className={styles.itemContent}>
                <div className={styles.itemName}>{preset.name}</div>
                <div className={styles.itemPrompt}>{preset.prompt}</div>
              </div>
              <Check size={14} className={styles.checkIcon} />
            </div>
          ))
        )}
      </div>
    </>
  )
}

export default PromptSelector
