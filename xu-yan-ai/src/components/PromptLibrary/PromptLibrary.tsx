import React, { useState, useCallback, useMemo } from 'react'
import { X, Plus, Trash2, Edit2, Check, Search } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { PromptPreset } from '../../types'
import styles from './PromptLibrary.module.css'

interface PromptLibraryProps {
  isOpen: boolean
  onClose: () => void
}

const PromptLibrary: React.FC<PromptLibraryProps> = ({ isOpen, onClose }) => {
  const { presets, addPreset, removePreset } = useAppStore()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', prompt: '', category: '自定义' })
  const [showForm, setShowForm] = useState(false)

  const filteredPresets = useMemo(() => {
    if (!searchTerm.trim()) return presets
    const term = searchTerm.toLowerCase()
    return presets.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.prompt.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term)
    )
  }, [presets, searchTerm])

  const groupedPresets = useMemo(() => {
    const groups: Record<string, PromptPreset[]> = {}
    filteredPresets.forEach(preset => {
      if (!groups[preset.category]) {
        groups[preset.category] = []
      }
      groups[preset.category].push(preset)
    })
    return groups
  }, [filteredPresets])

  const handleAddNew = useCallback(() => {
    setShowForm(true)
    setIsEditing(false)
    setEditingId(null)
    setFormData({ name: '', prompt: '', category: '自定义' })
  }, [])

  const handleEdit = useCallback((preset: PromptPreset) => {
    setShowForm(true)
    setIsEditing(true)
    setEditingId(preset.id)
    setFormData({ name: preset.name, prompt: preset.prompt, category: preset.category })
  }, [])

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定要删除这个提示词吗？')) {
      removePreset(id)
    }
  }, [removePreset])

  const handleSubmit = useCallback(() => {
    if (!formData.name.trim() || !formData.prompt.trim()) {
      alert('请填写标题和提示词内容')
      return
    }

    if (isEditing && editingId) {
      const existingPreset = presets.find(p => p.id === editingId)
      if (existingPreset) {
        removePreset(editingId)
        addPreset({
          id: editingId,
          name: formData.name.trim(),
          prompt: formData.prompt.trim(),
          category: formData.category.trim() || '自定义',
        })
      }
    } else {
      addPreset({
        id: `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: formData.name.trim(),
        prompt: formData.prompt.trim(),
        category: formData.category.trim() || '自定义',
      })
    }

    setShowForm(false)
    setIsEditing(false)
    setEditingId(null)
    setFormData({ name: '', prompt: '', category: '自定义' })
  }, [formData, isEditing, editingId, presets, addPreset, removePreset])

  const handleCancel = useCallback(() => {
    setShowForm(false)
    setIsEditing(false)
    setEditingId(null)
    setFormData({ name: '', prompt: '', category: '自定义' })
  }, [])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>提示词库</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              placeholder="搜索提示词..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button className={styles.addBtn} onClick={handleAddNew}>
            <Plus size={16} />
            添加提示词
          </button>
        </div>

        {showForm && (
          <div className={styles.form}>
            <div className={styles.formRow}>
              <label>标题</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="输入提示词标题"
                maxLength={50}
              />
            </div>
            <div className={styles.formRow}>
              <label>分类</label>
              <input
                type="text"
                value={formData.category}
                onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="输入分类名称"
                maxLength={20}
              />
            </div>
            <div className={styles.formRow}>
              <label>提示词内容</label>
              <textarea
                value={formData.prompt}
                onChange={e => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
                placeholder="输入提示词内容"
                rows={4}
                maxLength={500}
              />
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={handleCancel}>
                取消
              </button>
              <button className={styles.submitBtn} onClick={handleSubmit}>
                <Check size={14} />
                {isEditing ? '保存修改' : '添加'}
              </button>
            </div>
          </div>
        )}

        <div className={styles.content}>
          {Object.keys(groupedPresets).length === 0 ? (
            <div className={styles.empty}>
              <p>暂无提示词</p>
              <p className={styles.emptyHint}>点击上方"添加提示词"按钮创建你的第一个提示词</p>
            </div>
          ) : (
            Object.entries(groupedPresets).map(([category, categoryPresets]) => (
              <div key={category} className={styles.categoryGroup}>
                <div className={styles.categoryHeader}>
                  <span className={styles.categoryName}>{category}</span>
                  <span className={styles.categoryCount}>{categoryPresets.length}</span>
                </div>
                <div className={styles.presetList}>
                  {categoryPresets.map(preset => (
                    <div key={preset.id} className={styles.presetItem}>
                      <div className={styles.presetInfo}>
                        <div className={styles.presetName}>{preset.name}</div>
                        <div className={styles.presetPrompt}>{preset.prompt}</div>
                      </div>
                      <div className={styles.presetActions}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleEdit(preset)}
                          title="编辑"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={() => handleDelete(preset.id)}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.stats}>共 {presets.length} 个提示词</span>
        </div>
      </div>
    </div>
  )
}

export default PromptLibrary
