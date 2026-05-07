import React, { useState } from 'react'
import { X, Copy, Check, KeyRound, Wand2 } from 'lucide-react'
import { generateActivationCode } from '../../utils/licenseUtils'
import { useAppStore } from '../../store/appStore'
import styles from './AuthModal.module.css'

interface GenerateLicenseModalProps {
  isOpen: boolean
  onClose: () => void
}

export const GenerateLicenseModal: React.FC<GenerateLicenseModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [machineCode, setMachineCode] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const addToast = useAppStore((state) => state.addToast)

  const handleMachineCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 只允许输入大写字母、数字和连字符
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
    setMachineCode(value)
    // 清空之前的激活码
    setActivationCode('')
    setError('')
  }

  const handleGenerate = () => {
    if (!machineCode.trim()) {
      setError('请输入机器码')
      return
    }

    // 验证机器码格式
    const cleanCode = machineCode.replace(/-/g, '')
    if (cleanCode.length !== 16) {
      setError('机器码格式不正确，应为16位字符')
      return
    }

    try {
      const code = generateActivationCode(machineCode.trim())
      setActivationCode(code)
      setError('')
    } catch (err) {
      setError('生成激活码失败: ' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const handleCopyActivationCode = async () => {
    if (!activationCode) return
    
    try {
      await navigator.clipboard.writeText(activationCode)
      setCopied(true)
      addToast({ type: 'success', title: '已复制激活码' })
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const handleClose = () => {
    setMachineCode('')
    setActivationCode('')
    setError('')
    setCopied(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>
            <KeyRound size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            获取激活码
          </h2>
          <button className={styles.closeBtn} onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.form}>
          {/* 机器码输入 */}
          <div className={styles.field}>
            <label>
              机器码
              <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={machineCode}
              onChange={handleMachineCodeChange}
              placeholder="输入用户的机器码 (格式: XXXX-XXXX-XXXX-XXXX)"
              className={styles.machineCodeInput}
              autoFocus
            />
            <p className={styles.fieldHint}>输入用户提供的16位机器码</p>
          </div>

          {/* 转换按钮 */}
          <div className={styles.actions} style={{ marginTop: '16px', marginBottom: '16px' }}>
            <button
              className={styles.submitBtn}
              onClick={handleGenerate}
              disabled={!machineCode.trim()}
            >
              <Wand2 size={16} style={{ marginRight: '6px' }} />
              转换
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* 激活码显示 */}
          {activationCode && (
            <div className={styles.field}>
              <label>转换后的激活码</label>
              <div className={styles.activationCodeResult}>
                <input
                  type="text"
                  value={activationCode}
                  readOnly
                  className={styles.activationCodeInput}
                />
                <button
                  className={styles.copyBtn}
                  onClick={handleCopyActivationCode}
                  title="复制激活码"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <p className={styles.fieldHint} style={{ color: 'var(--color-accent)' }}>
                请将激活码发送给用户
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
