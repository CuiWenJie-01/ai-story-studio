import React, { useState, useEffect } from 'react'
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

export const RegisterModal: React.FC<RegisterModalProps> = ({ isOpen, onClose, onOpenLogin }) => {
  const [nickname, setNickname] = useState('')
  const [account, setAccount] = useState('')
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [company, setCompany] = useState('')
  const [department, setDepartment] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const addToast = useAppStore((state) => state.addToast)

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    return emailRegex.test(value)
  }

  const validateAccount = (value: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    const phoneRegex = /^1[3-9]\d{9}$/
    return emailRegex.test(value) || phoneRegex.test(value)
  }

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

  // 发送邮箱验证码
  const handleSendEmailCode = async () => {
    if (!validateEmail(email)) {
      addToast({ type: 'error', title: '请输入正确的邮箱地址' })
      return
    }

    setSendingCode(true)
    try {
      const response = await invoke<{ success: boolean; message: string; cooldown_seconds: number }>(
        'tauri_send_email_code',
        {
          email,
          purpose: 'register'
        }
      )

      if (response.success) {
        setCountdown(60)
        addToast({ type: 'success', title: '验证码已发送', message: response.message })
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
  const verifyEmailCode = async (): Promise<boolean> => {
    try {
      const response = await invoke<{ success: boolean; message: string }>(
        'tauri_verify_email_code',
        {
          email,
          code: emailCode,
          purpose: 'register'
        }
      )
      return response.success
    } catch (err) {
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (nickname.length < 2 || nickname.length > 20) {
      addToast({ type: 'error', title: '昵称长度需在2-20字符之间' })
      return
    }

    if (!validateAccount(account)) {
      addToast({ type: 'error', title: '账号格式不正确', message: '请输入邮箱或手机号' })
      return
    }

    if (!validateEmail(email)) {
      addToast({ type: 'error', title: '请输入正确的邮箱地址' })
      return
    }

    if (!emailCode.trim()) {
      addToast({ type: 'error', title: '请输入邮箱验证码' })
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

    if (!company.trim()) {
      addToast({ type: 'error', title: '请输入所属企业' })
      return
    }

    if (!department.trim()) {
      addToast({ type: 'error', title: '请输入所属部门' })
      return
    }

    // 先验证邮箱验证码
    setLoading(true)
    try {
      const codeValid = await verifyEmailCode()
      if (!codeValid) {
        addToast({ type: 'error', title: '邮箱验证码错误或已过期' })
        setLoading(false)
        return
      }
    } catch (err) {
      addToast({ type: 'error', title: '验证码验证失败', message: err instanceof Error ? err.message : '请重试' })
      setLoading(false)
      return
    }

    // 提交注册
    try {
      const response = await invoke<AuthResponse>('tauri_register', {
        nickname,
        account,
        email,
        password,
        company,
        department,
      })

      if (response.success) {
        setNickname('')
        setAccount('')
        setEmail('')
        setEmailCode('')
        setPassword('')
        setConfirmPassword('')
        setCompany('')
        setDepartment('')
        addToast({ type: 'success', title: '注册成功', message: '请使用账号登录' })
        onClose()
        onOpenLogin()
      } else {
        addToast({ type: 'error', title: '注册失败', message: response.message || '请重试' })
      }
    } catch (err) {
      addToast({ type: 'error', title: '注册失败', message: err instanceof Error ? err.message : '网络错误' })
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
          <div className={styles.field}>
            <label>昵称 <span className={styles.required}>*</span></label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="2-20字符"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>账号 <span className={styles.required}>*</span></label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="邮箱或手机号"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>邮箱 <span className={styles.required}>*</span></label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入邮箱地址"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>邮箱验证码 <span className={styles.required}>*</span></label>
            <div className={styles.codeField}>
              <input
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                placeholder="请输入6位验证码"
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
          </div>

          <div className={styles.field}>
            <label>密码 <span className={styles.required}>*</span></label>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            <label>确认密码 <span className={styles.required}>*</span></label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>所属企业 <span className={styles.required}>*</span></label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="请输入所属企业"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>所属部门 <span className={styles.required}>*</span></label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="请输入所属部门"
              disabled={loading}
            />
          </div>

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading}
            >
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
