import { useState, useEffect } from 'react'
import { X, Users, Package, Image, FileText, ChevronLeft } from 'lucide-react'
import CharacterLibrary from '../CharacterLibrary'
import GenericLibrary from '../GenericLibrary'
import ScriptAnalysis from '../ScriptAnalysis'
import styles from './LibraryManager.module.css'

type LibraryType = 'character' | 'prop' | 'scene' | 'script' | null

interface LibraryManagerProps {
  isOpen: boolean
  onClose: () => void
}

const LIBRARY_OPTIONS = [
  { id: 'character' as const, name: '角色库', icon: Users, description: '管理项目角色素材', folderName: '角色库' },
  { id: 'prop' as const, name: '道具库', icon: Package, description: '管理项目道具素材', folderName: '道具库' },
  { id: 'scene' as const, name: '场景库', icon: Image, description: '管理项目场景素材', folderName: '场景库' },
  { id: 'script' as const, name: '剧本解析', icon: FileText, description: '解析剧本生成分镜', folderName: '' },
]

const LibraryManager: React.FC<LibraryManagerProps> = ({ isOpen, onClose }) => {
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryType>(null)
  const [showScriptAnalysis, setShowScriptAnalysis] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSelectedLibrary(null)
      setShowScriptAnalysis(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleBack = () => {
    setSelectedLibrary(null)
  }

  const handleSelectLibrary = (id: LibraryType) => {
    if (id === 'script') {
      setShowScriptAnalysis(true)
    } else {
      setSelectedLibrary(id)
    }
  }

  if (showScriptAnalysis) {
    return <ScriptAnalysis isOpen={true} onClose={onClose} />
  }

  if (selectedLibrary === 'character') {
    return <CharacterLibrary isOpen={true} onClose={onClose} />
  }

  if (selectedLibrary === 'prop') {
    return (
      <GenericLibrary 
        isOpen={true} 
        onClose={onClose} 
        config={{ kind: 'prop', title: '道具库', folderName: '道具库' }}
      />
    )
  }

  if (selectedLibrary === 'scene') {
    return (
      <GenericLibrary 
        isOpen={true} 
        onClose={onClose} 
        config={{ kind: 'scene', title: '场景库', folderName: '场景库' }}
      />
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>素材库</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={styles.content}>
          {selectedLibrary === null ? (
            <div className={styles.grid}>
              {LIBRARY_OPTIONS.map((library) => {
                const Icon = library.icon
                return (
                  <div
                    key={library.id}
                    className={styles.card}
                    onClick={() => handleSelectLibrary(library.id)}
                  >
                    <div className={styles.cardIcon}>
                      <Icon size={32} />
                    </div>
                    <div className={styles.cardInfo}>
                      <h4>{library.name}</h4>
                      <p>{library.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={styles.libraryView}>
              <div className={styles.libraryHeader}>
                <button className={styles.backBtn} onClick={handleBack}>
                  <ChevronLeft size={18} />
                  <span>返回</span>
                </button>
                <h3>{LIBRARY_OPTIONS.find(l => l.id === selectedLibrary)?.name}</h3>
              </div>
              <div className={styles.libraryContent}>
                <div className={styles.emptyState}>
                  {(() => {
                    const Icon = LIBRARY_OPTIONS.find(l => l.id === selectedLibrary)?.icon || Package
                    return <Icon size={48} />
                  })()}
                  <p>功能即将上线</p>
                  <span>敬请期待</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LibraryManager
