import React, { useState, useEffect } from 'react'
import { X, Copy, Check, Key } from 'lucide-react'
import { generateMachineCode, activateSoftware } from '../../utils/licenseUtils'
import { useAppStore } from '../../store/appStore'
import styles from './AuthModal.module.css'

interface ActivateSoftwareModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ActivateSoftwareModal: React.FC<ActivateSoftwareModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [machineCode, setMachineCode] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const addToast = useAppStore((state) => state.addToast)

  useEffect(() => {
    if (isOpen) {
      generateMachineCode().then((code) => {
        setMachineCode(code)
      })
      setActivationCode('')
      setError('')
      setSuccess('')
      setCopied(false)
    }
  }, [isOpen])

  const handleCopyMachineCode = async () => {
    try {
      await navigator.clipboard.writeText(machineCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const handleActivate = async () => {
    if (!activationCode.trim()) {
      setError('请输入激活码')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const result = await activateSoftware(activationCode.trim())
      if (result.success) {
        setSuccess(result.message)
        addToast({ type: 'success', title: '激活成功', message: result.message })
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '激活失败')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleActivate()
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>
            <Key size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            激活本机软件
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.form}>
          {/* 机器码显示 */}
          <div className={styles.field}>
            <label>本机机器码</label>
            <div className={styles.machineCodeContainer}>
              <input
                type="text"
                value={machineCode}
                readOnly
                className={styles.machineCodeInput}
              />
              <button
                className={styles.copyBtn}
                onClick={handleCopyMachineCode}
                title="复制机器码"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p className={styles.fieldHint}>请将机器码发送给管理员获取激活码</p>
          </div>

          {/* 激活码输入 */}
          <div className={styles.field}>
            <label>
              激活码
              <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="请输入激活码 (格式: XYXX-XXXX-XXXX-XXXX-XXXX-XXXX)"
              className={styles.activationInput}
              disabled={loading}
              autoFocus
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className={styles.success}>
              {success}
            </div>
          )}

          {/* 激活按钮 */}
          <div className={styles.actions} style={{ marginTop: '24px' }}>
            <button
              className={styles.submitBtn}
              onClick={handleActivate}
              disabled={loading || !activationCode.trim()}
            >
              {loading ? '激活中...' : '激活'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
