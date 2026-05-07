import { useState } from 'react'
import { Wand2, ChevronDown, Plus, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import styles from './PromptInput.module.css'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const PromptInput: React.FC<PromptInputProps> = ({ value, onChange, placeholder }) => {
  const { presets, settings } = useAppStore()
  const [showPresets, setShowPresets] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const categories = ['all', ...new Set(presets.map((p) => p.category))]
  const filteredPresets = selectedCategory === 'all' 
    ? presets 
    : presets.filter((p) => p.category === selectedCategory)

  const charCount = value.length
  const maxChars = 2000

  const handlePresetClick = (presetPrompt: string) => {
    onChange(value ? `${value}, ${presetPrompt}` : presetPrompt)
    setShowPresets(false)
  }

  const handleClear = () => {
    onChange('')
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>
          <Wand2 size={18} />
          提示词输入
        </h3>
        <span className={styles.charCount}>
          {charCount} / {maxChars}
        </span>
      </div>

      <div className={styles.inputWrapper}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
          placeholder={placeholder || "输入描述性提示词，描述您想要生成的图像风格、内容、氛围等..."}
          className={styles.textarea}
          rows={6}
          style={{ fontSize: `${settings.promptFontSize}px` }}
        />
        {value && (
          <button className={styles.clearBtn} onClick={handleClear} title="清空">
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.presetsSection}>
        <button
          className={styles.presetsToggle}
          onClick={() => setShowPresets(!showPresets)}
        >
          <Plus size={16} />
          常用预设
          <ChevronDown
            size={16}
            className={`${styles.chevron} ${showPresets ? styles.chevronOpen : ''}`}
          />
        </button>

        {showPresets && (
          <div className={styles.presetsPanel}>
            <div className={styles.categoryTabs}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`${styles.categoryTab} ${selectedCategory === cat ? styles.categoryTabActive : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat === 'all' ? '全部' : cat}
                </button>
              ))}
            </div>

            <div className={styles.presetsList}>
              {filteredPresets.map((preset) => (
                <button
                  key={preset.id}
                  className={styles.presetItem}
                  onClick={() => handlePresetClick(preset.prompt)}
                  title={preset.prompt}
                >
                  <span className={styles.presetName}>{preset.name}</span>
                  <span className={styles.presetPrompt}>{preset.prompt.slice(0, 30)}...</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PromptInput
