import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import type { User } from '../../types'
import styles from './AuthModal.module.css'

interface RegisterModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenLogin: () => void
}

interface AuthResponse {
  success: boolean
  message: string
  user: User | null
}

const validateAccount = (value: string): boolean => {
  const length = [...value].length
  return length >= 3 && length <= 32 && /^[\p{L}\p{N}_-]+$/u.test(value)
}

const validatePassword = (value: string): string | null => {
  if (value.length < 8) return '密码长度至少8位'
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value)) {
    return '密码必须包含大小写字母和数字'
  }
  return null
}

export const RegisterModal: React.FC<RegisterModalProps> = ({ isOpen, onClose, onOpenLogin }) => {
  const [nickname, setNickname] = useState('')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [company, setCompany] = useState('')
  const [department, setDepartment] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const addToast = useAppStore((state) => state.addToast)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if ([...nickname.trim()].length < 2 || [...nickname.trim()].length > 20) {
      addToast({ type: 'error', title: '昵称长度需在2-20字符之间' })
      return
    }
    if (!validateAccount(account.trim())) {
      addToast({
        type: 'error',
        title: '用户名格式不正确',
        message: '请输入3-32位中文、字母、数字、下划线或短横线',
      })
      return
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      addToast({ type: 'error', title: passwordError })
      return
    }
    if (password !== confirmPassword) {
      addToast({ type: 'error', title: '两次输入的密码不一致' })
      return
    }

    setLoading(true)
    try {
      const response = await invoke<AuthResponse>('tauri_register', {
        nickname: nickname.trim(),
        account: account.trim(),
        password,
        company: company.trim(),
        department: department.trim(),
      })
      if (!response.success) {
        addToast({ type: 'error', title: '注册失败', message: response.message })
        return
      }
      setNickname('')
      setAccount('')
      setPassword('')
      setConfirmPassword('')
      setCompany('')
      setDepartment('')
      addToast({ type: 'success', title: '注册成功', message: response.message })
      onClose()
      onOpenLogin()
    } catch (error) {
      addToast({
        type: 'error',
        title: '注册失败',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.registerModal}`}>
        <div className={styles.header}>
          <h2>注册</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label>昵称 <span className={styles.required}>*</span></label>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="2-20个字符" disabled={loading} />
            </div>
            <div className={styles.field}>
              <label>用户名 <span className={styles.required}>*</span></label>
              <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="3-32位字符" autoComplete="username" disabled={loading} />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label>密码 <span className={styles.required}>*</span></label>
              <div className={styles.passwordField}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少8位，包含大小写字母和数字"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button type="button" className={styles.togglePassword} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
            <div className={styles.field}>
              <label>确认密码 <span className={styles.required}>*</span></label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
                autoComplete="new-password"
                disabled={loading}
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label>所属企业</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="可选" disabled={loading} />
            </div>
            <div className={styles.field}>
              <label>所属部门</label>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="可选" disabled={loading} />
            </div>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? '注册中...' : '注册'}
            </button>
            <button
              type="button"
              className={styles.registerBtn}
              onClick={() => {
                onClose()
                onOpenLogin()
              }}
              disabled={loading}
            >
              返回登录
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
