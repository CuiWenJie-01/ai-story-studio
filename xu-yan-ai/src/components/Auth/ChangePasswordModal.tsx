import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { User } from '../../types'
import styles from './AuthModal.module.css'

interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
  account: string
}

interface AuthResponse {
  success: boolean
  message: string
  user: User | null
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ 
  isOpen, 
  onClose, 
  account 
}) => {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const validatePassword = (value: string): string | null => {
    if (value.length < 8) {
      return '密码长度至少8位'
    }
    const hasUpper = /[A-Z]/.test(value)
    const hasLower = /[a-z]/.test(value)
    const hasDigit = /\d/.test(value)
    if (!hasUpper || !hasLower || !hasDigit) {
      return '密码必须包含大小写字母和数字'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!oldPassword.trim()) {
      setError('请输入原密码')
      return
    }

    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    if (oldPassword === newPassword) {
      setError('新密码不能与原密码相同')
      return
    }

    setLoading(true)

    try {
      const response = await invoke<AuthResponse>('tauri_change_password', {
        account,
        oldPassword,
        newPassword,
      })

      if (response.success) {
        setSuccess('密码修改成功')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError(response.message || '密码修改失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '密码修改失败')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>修改密码</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>原密码</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="请输入原密码"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>新密码</label>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少8位，包含大小写字母和数字"
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label>确认新密码</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              disabled={loading}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {success && <div className={styles.success}>{success}</div>}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading}
            >
              {loading ? '修改中...' : '确认修改'}
            </button>
            <button
              type="button"
              className={styles.registerBtn}
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
