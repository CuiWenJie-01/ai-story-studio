import { useCallback } from 'react'
import { Type } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store/appStore'
import styles from './GlobalPrompt.module.css'

interface GlobalPromptProps {
  activeMode: 'image' | 'video'
}

const GlobalPrompt = ({ activeMode }: GlobalPromptProps) => {
  const { globalPrompt, setGlobalPrompt } = useAppStore(
    useShallow((state) => ({
      globalPrompt: state.globalPrompt,
      setGlobalPrompt: state.setGlobalPrompt,
    }))
  )

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setGlobalPrompt(e.target.value)
  }, [setGlobalPrompt])

  const placeholder = activeMode === 'image'
    ? '请输入全局提示词，会自动拼接到生图提示词前面，生成图片'
    : '请输入全局提示词，会自动拼接到视频提示词前面，生成视频'

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Type size={16} />
        全局提示词
      </div>
      <textarea
        className={styles.textarea}
        value={globalPrompt}
        onChange={handleChange}
        placeholder={placeholder}
      />
    </div>
  )
}

export default GlobalPrompt
