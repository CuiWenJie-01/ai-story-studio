import React, { useState, useEffect } from 'react'
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

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onOpenRegister }) => {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [userEmail, setUserEmail] = useState('')
  const [showEmailCode, setShowEmailCode] = useState(false)

  const setUser = useAppStore((state) => state.setUser)
  const addToast = useAppStore((state) => state.addToast)

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const validateAccount = (value: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    const phoneRegex = /^1[3-9]\d{9}$/
    return emailRegex.test(value) || phoneRegex.test(value)
  }

  // 获取用户邮箱
  const fetchUserEmail = async (): Promise<string | null> => {
    try {
      const response = await invoke<{ success: boolean; email: string | null }>(
        'tauri_get_user_email',
        { account }
      )
      if (response.success && response.email) {
        setUserEmail(response.email)
        return response.email
      }
      return null
    } catch (err) {
      console.error('获取用户邮箱失败:', err)
      return null
    }
  }

  // 发送邮箱验证码
  const handleSendEmailCode = async () => {
    if (!account.trim()) {
      addToast({ type: 'error', title: '请先输入账号' })
      return
    }

    if (!validateAccount(account)) {
      addToast({ type: 'error', title: '账号格式不正确', message: '请输入邮箱或手机号' })
      return
    }

    // 先获取用户邮箱
    const email = await fetchUserEmail()
    if (!email) {
      addToast({ type: 'error', title: '该账号未绑定邮箱' })
      return
    }

    setSendingCode(true)
    try {
      const response = await invoke<{ success: boolean; message: string; cooldown_seconds: number }>(
        'tauri_send_email_code',
        {
          email,
          purpose: 'login'
        }
      )

      if (response.success) {
        setCountdown(60)
        setShowEmailCode(true)
        addToast({ type: 'success', title: '验证码已发送', message: `已发送至 ${email}` })
      } else {
        addToast({ type: 'error', title: '发送失败', message: response.message })
        if (response.cooldown_seconds > 0) {
          setCountdown(response.cooldown_seconds)
        }
      }
    } catch (err) {
      addToast({ type: 'error', title: '发送失败', message: err instanceof Error ? err.message : '网络错误' })
    } finally {
      setSendingCode(false)
    }
  }

  // 验证邮箱验证码
  const verifyEmailCode = async (email: string): Promise<boolean> => {
    try {
      const response = await invoke<{ success: boolean; message: string }>(
        'tauri_verify_email_code',
        {
          email,
          code: emailCode,
          purpose: 'login'
        }
      )
      return response.success
    } catch (err) {
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!account.trim()) {
      addToast({ type: 'error', title: '请输入账号' })
      return
    }

    if (!validateAccount(account)) {
      addToast({ type: 'error', title: '账号格式不正确', message: '请输入邮箱或手机号' })
      return
    }

    if (!password.trim()) {
      addToast({ type: 'error', title: '请输入密码' })
      return
    }

    // 必须输入邮箱验证码
    if (!emailCode.trim()) {
      addToast({ type: 'error', title: '请输入邮箱验证码' })
      return
    }

    if (!userEmail) {
      addToast({ type: 'error', title: '请先获取验证码' })
      return
    }

    // 验证邮箱验证码
    const codeValid = await verifyEmailCode(userEmail)
    if (!codeValid) {
      addToast({ type: 'error', title: '邮箱验证码错误或已过期' })
      return
    }

    setLoading(true)

    try {
      const response = await invoke<AuthResponse>('tauri_login', {
        account,
        password,
      })

      if (response.success && response.user) {
        setUser(response.user)
        setAccount('')
        setPassword('')
        setEmailCode('')
        setUserEmail('')
        setShowEmailCode(false)
        addToast({ type: 'success', title: '登录成功', message: `欢迎回来，${response.user.nickname}` })
        onClose()
      } else {
        addToast({ type: 'error', title: '登录失败', message: response.message || '请检查账号密码' })
      }
    } catch (err) {
      addToast({ type: 'error', title: '登录失败', message: err instanceof Error ? err.message : '网络错误' })
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
            <label>账号</label>
            <input
              type="text"
              value={account}
              onChange={(e) => {
                setAccount(e.target.value)
                // 账号改变时重置邮箱验证码状态
                setShowEmailCode(false)
                setEmailCode('')
                setUserEmail('')
                setCountdown(0)
              }}
              placeholder="请输入邮箱或手机号"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>密码</label>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
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

          {/* 邮箱验证码区域 */}
          <div className={styles.field}>
            <label>邮箱验证码</label>
            <div className={styles.codeField}>
              <input
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                placeholder={showEmailCode ? "请输入6位验证码" : "点击右侧按钮获取"}
                disabled={loading}
                maxLength={6}
              />
              <button
                type="button"
                className={styles.sendCodeBtn}
                onClick={handleSendEmailCode}
                disabled={sendingCode || countdown > 0 || loading}
              >
                {countdown > 0 ? `${countdown}s` : sendingCode ? '发送中...' : '获取验证码'}
              </button>
            </div>
            {userEmail && (
              <p className={styles.fieldHint}>验证码将发送至: {userEmail}</p>
            )}
          </div>

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading}
            >
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
