import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import styles from './ShotNavigator.module.css'

const ShotNavigator: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const workItems = useAppStore(useCallback(state => state.workItems, []))
  const setActiveWorkId = useAppStore(useCallback(state => state.setActiveWorkId, []))
  const disableShotNavigator = useAppStore(useCallback(state => state.disableShotNavigator, []))

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disableShotNavigator) return

    const activeElement = document.activeElement
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.getAttribute('contenteditable') === 'true'
    )

    if (e.key === 'Enter' && !isInputFocused && !isVisible) {
      e.preventDefault()
      setIsVisible(true)
      setInputValue('')
    }

    if (e.key === 'Escape' && isVisible) {
      e.preventDefault()
      setIsVisible(false)
    }
  }, [isVisible, disableShotNavigator])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (isVisible && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isVisible])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '')
    setInputValue(value)
  }, [])

  const handleSubmit = useCallback(() => {
    const shotNumber = parseInt(inputValue, 10)
    if (isNaN(shotNumber) || shotNumber <= 0) return

    const targetItem = workItems.find(item => 
      String(item.shotNumber) === String(shotNumber)
    )

    if (targetItem) {
      setActiveWorkId(targetItem.id)
      
      setTimeout(() => {
        const element = document.querySelector(`[data-shot-number="${shotNumber}"]`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }

    setIsVisible(false)
    setInputValue('')
  }, [inputValue, workItems, setActiveWorkId])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsVisible(false)
    }
    e.stopPropagation()
  }, [handleSubmit])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      setIsVisible(false)
    }
  }, [])

  const handleClose = useCallback(() => {
    setIsVisible(false)
  }, [])

  if (!isVisible) return null

  return (
    <div 
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>输入镜头号</span>
          <button className={styles.closeBtn} onClick={handleClose}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.content}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            className={styles.input}
            placeholder="请输入镜头号..."
            inputMode="numeric"
            pattern="[0-9]*"
          />
          <div className={styles.hint}>
            按 Enter 确认 · Esc 取消
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShotNavigator
