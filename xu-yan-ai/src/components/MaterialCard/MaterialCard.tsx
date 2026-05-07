import { Package, Users, PackageOpen, Image } from 'lucide-react'
import type { SubjectMaterial } from '../../types'
import styles from './MaterialCard.module.css'

interface MaterialCardProps {
  material: SubjectMaterial
  onClick: () => void
}

const MaterialCard: React.FC<MaterialCardProps> = ({ material, onClick }) => {
  const totalItems = material.characters.length + material.props.length + material.scenes.length

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.icon}>
        <Package size={32} />
      </div>
      <div className={styles.info}>
        <h3 className={styles.name}>{material.projectName}</h3>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <Users size={14} />
            <span>{material.characters.length}</span>
          </div>
          <div className={styles.stat}>
            <PackageOpen size={14} />
            <span>{material.props.length}</span>
          </div>
          <div className={styles.stat}>
            <Image size={14} />
            <span>{material.scenes.length}</span>
          </div>
        </div>
        <p className={styles.date}>{formatDate(material.updatedAt)}</p>
      </div>
      <div className={styles.badge}>{totalItems}</div>
    </div>
  )
}

export default MaterialCard
