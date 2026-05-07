import { Sun, Moon, Monitor } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { ThemeMode } from '../../types'
import styles from './ThemeToggle.module.css'

const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useAppStore()

  const themes: { value: ThemeMode; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun size={16} />, label: '浅色' },
    { value: 'dark', icon: <Moon size={16} />, label: '深色' },
    { value: 'system', icon: <Monitor size={16} />, label: '系统' },
  ]

  return (
    <div className={styles.container}>
      {themes.map((t) => (
        <button
          key={t.value}
          className={`${styles.btn} ${theme === t.value ? styles.active : ''}`}
          onClick={() => setTheme(t.value)}
          title={t.label}
        >
          {t.icon}
        </button>
      ))}
    </div>
  )
}

export default ThemeToggle
