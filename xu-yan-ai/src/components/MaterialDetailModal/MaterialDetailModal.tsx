import { useState, useEffect, useMemo } from 'react'
import { X, Users, PackageOpen, Image, Globe, Search, Upload, FolderOpen } from 'lucide-react'
import { readDir, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { convertFileSrc } from '@tauri-apps/api/core'
import { basename, join } from '@tauri-apps/api/path'
import type { SubjectMaterial, MaterialItem, MaterialCategory } from '../../types'
import styles from './MaterialDetailModal.module.css'

interface MaterialDetailModalProps {
  isOpen: boolean
  material: SubjectMaterial | null
  onClose: () => void
}

const CATEGORY_CONFIG = {
  character: { icon: Users, label: '角色', folder: '角色库' },
  prop: { icon: PackageOpen, label: '道具', folder: '道具库' },
  scene: { icon: Image, label: '场景', folder: '场景库' },
  online: { icon: Globe, label: '在线', folder: '' },
}

const MaterialDetailModal: React.FC<MaterialDetailModalProps> = ({ isOpen, material, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<MaterialCategory>('character')
  const [searchQuery, setSearchQuery] = useState('')
  const [localMaterials, setLocalMaterials] = useState<MaterialItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && material && activeCategory !== 'online') {
      loadMaterialsFromFolder()
    }
  }, [isOpen, material, activeCategory])

  const loadMaterialsFromFolder = async () => {
    if (!material || activeCategory === 'online') return

    setIsLoading(true)
    try {
      const folderName = CATEGORY_CONFIG[activeCategory].folder
      const folderPath = `${material.projectPath}/${folderName}`
      
      const files = await readDir(folderPath)
      const imageFiles = files.filter(file => 
        !file.name?.startsWith('.') && 
        /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name || '')
      )

      const materials: MaterialItem[] = imageFiles.map(file => {
        const filePath = `${folderPath}/${file.name}`
        return {
          id: `${material.projectId}-${file.name}`,
          name: file.name?.replace(/\.[^/.]+$/, '') || '',
          category: activeCategory,
          path: filePath,
          thumbnailUrl: convertFileSrc(filePath),
          previewUrl: convertFileSrc(filePath),
          createdAt: Date.now(),
          projectId: material.projectId,
          projectName: material.projectName,
        }
      })

      setLocalMaterials(materials)
    } catch (error) {
      console.error('Failed to load materials:', error)
      setLocalMaterials([])
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMaterials = useMemo(() => {
    if (!searchQuery.trim()) return localMaterials
    
    const lowerQuery = searchQuery.toLowerCase()
    return localMaterials.filter(item => 
      item.name.toLowerCase().includes(lowerQuery) ||
      item.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  }, [localMaterials, searchQuery])

  const handleImport = async () => {
    if (!material || activeCategory === 'online') return

    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: true,
        filters: [{
          name: '图片',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
        }]
      })

      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected]
        const folderName = CATEGORY_CONFIG[activeCategory].folder
        const targetFolder = await join(material.projectPath, folderName)

        for (const filePath of files) {
          try {
            const fileName = await basename(filePath)
            const fileData = await readFile(filePath)
            const targetPath = await join(targetFolder, fileName)
            await writeFile(targetPath, fileData)
          } catch (error) {
            console.error(`Failed to import file ${filePath}:`, error)
          }
        }

        await loadMaterialsFromFolder()
      }
    } catch (error) {
      console.error('Failed to import:', error)
    }
  }

  if (!isOpen || !material) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>{material.projectName}</h2>
            <div className={styles.categoryTabs}>
              {(Object.keys(CATEGORY_CONFIG) as MaterialCategory[]).map((category) => {
                const config = CATEGORY_CONFIG[category]
                const Icon = config.icon
                return (
                  <button
                    key={category}
                    className={`${styles.categoryTab} ${activeCategory === category ? styles.categoryTabActive : ''}`}
                    onClick={() => setActiveCategory(category)}
                  >
                    <Icon size={16} />
                    <span>{config.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.searchBox}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="搜索素材..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            <button className={styles.importBtn} onClick={handleImport}>
              <Upload size={16} />
              <span>导入</span>
            </button>
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className={styles.content}>
          {activeCategory === 'online' ? (
            <div className={styles.onlinePlaceholder}>
              <Globe size={48} className={styles.placeholderIcon} />
              <p className={styles.placeholderText}>在线素材库功能即将上线</p>
              <p className={styles.placeholderHint}>敬请期待</p>
            </div>
          ) : isLoading ? (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p>加载中...</p>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className={styles.empty}>
              <FolderOpen size={48} className={styles.emptyIcon} />
              <p className={styles.emptyText}>
                {searchQuery ? '未找到匹配的素材' : '暂无素材'}
              </p>
              <p className={styles.emptyHint}>
                {searchQuery ? '请尝试其他搜索关键词' : '点击右上角"导入"按钮添加素材'}
              </p>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredMaterials.map((item) => (
                <div 
                  key={item.id} 
                  className={styles.materialCard}
                  onClick={() => item.previewUrl && setPreviewImage(item.previewUrl)}
                >
                  <div className={styles.materialThumbnail}>
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} />
                    ) : (
                      <div className={styles.placeholderThumbnail}>
                        <Image size={24} />
                      </div>
                    )}
                  </div>
                  <div className={styles.materialInfo}>
                    <p className={styles.materialName}>{item.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {previewImage && (
        <div className={styles.previewOverlay} onClick={() => setPreviewImage(null)}>
          <div className={styles.previewContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.previewClose} onClick={() => setPreviewImage(null)}>
              <X size={24} />
            </button>
            <img src={previewImage} alt="预览" className={styles.previewImage} />
          </div>
        </div>
      )}
    </div>
  )
}

export default MaterialDetailModal
