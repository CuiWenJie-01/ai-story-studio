import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import type { User } from '../../types'
import styles from './AuthModal.module.css'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenRegister: () => void
}

interface AuthResponse {
  success: boolean
  message: string
  user: User | null
}

function getInstanceId(): string {
  const key = 'xuyan_instance_id'
  let value = localStorage.getItem(key)
  if (!value) {
    value = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(key, value)
  }
  return value
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onOpenRegister }) => {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const setUser = useAppStore((state) => state.setUser)
  const addToast = useAppStore((state) => state.addToast)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!account.trim()) {
      addToast({ type: 'error', title: '请输入用户名' })
      return
    }
    if (!password) {
      addToast({ type: 'error', title: '请输入密码' })
      return
    }

    setLoading(true)
    try {
      const response = await invoke<AuthResponse>('tauri_login', {
        account: account.trim(),
        password,
        instanceId: getInstanceId(),
      })
      if (!response.success || !response.user) {
        addToast({ type: 'error', title: '登录失败', message: response.message })
        return
      }
      setUser(response.user)
      setAccount('')
      setPassword('')
      addToast({ type: 'success', title: '登录成功', message: `欢迎回来，${response.user.nickname}` })
      onClose()
    } catch (error) {
      addToast({
        type: 'error',
        title: '登录失败',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>登录</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>用户名</label>
            <input
              type="text"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>密码</label>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </button>
            <button
              type="button"
              className={styles.registerBtn}
              onClick={() => {
                onClose()
                onOpenRegister()
              }}
              disabled={loading}
            >
              注册
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
