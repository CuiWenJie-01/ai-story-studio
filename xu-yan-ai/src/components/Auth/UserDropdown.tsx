import React, { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import type { User } from '../../types'
import styles from './AuthModal.module.css'

interface AuthResponse {
  success: boolean
  message: string
  user: User | null
}

interface UserDropdownProps {
  onOpenLogin: () => void
  onOpenChangePassword: () => void
  onOpenActivateSoftware?: () => void
  onOpenGenerateLicense?: () => void
  onOpenUserManagement?: () => void
}

export const UserDropdown: React.FC<UserDropdownProps> = ({ 
  onOpenLogin, 
  onOpenChangePassword,
  onOpenActivateSoftware,
  onOpenGenerateLicense,
  onOpenUserManagement,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const user = useAppStore((state) => state.user)
  const setUser = useAppStore((state) => state.setUser)
  const addToast = useAppStore((state) => state.addToast)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRefresh = async () => {
    if (!user?.account || refreshing) return

    setRefreshing(true)
    try {
      const response = await invoke<AuthResponse>('tauri_refresh_user_info', { account: user.account })
      if (response.success && response.user) {
        setUser(response.user)
        addToast({ type: 'success', title: '刷新成功' })
      } else {
        addToast({ type: 'error', title: '刷新失败', message: response.message })
      }
    } catch (err) {
      addToast({ type: 'error', title: '刷新失败', message: err instanceof Error ? err.message : '网络错误' })
    } finally {
      setRefreshing(false)
    }
  }

  const handleLogout = async () => {
    if (!user?.account) return

    try {
      const instanceId = localStorage.getItem('xuyan_instance_id') || ''
      await invoke<AuthResponse>('tauri_logout', { account: user.account, instanceId })
      setUser(null)
      setIsOpen(false)
      addToast({ type: 'success', title: '已退出登录' })
    } catch (err) {
      addToast({ type: 'error', title: '退出失败', message: err instanceof Error ? err.message : '网络错误' })
    }
  }

  const getRemainingDaysClass = (days: number): string => {
    if (days <= 0) return styles.danger
    if (days <= 7) return styles.warning
    return ''
  }

  if (!user) {
    return (
      <button 
        className={styles.loginButton} 
        onClick={(e) => {
          console.log('[UserDropdown] Login button clicked')
          e.stopPropagation()
          onOpenLogin()
        }}
      >
        <div className={styles.loginAvatar}>
          ?
        </div>
        <div className={styles.loginText}>
          <span className={styles.loginTitle}>未登录</span>
          <span className={styles.loginHint}>点击登录</span>
        </div>
      </button>
    )
  }

  return (
    <div className={styles.userInfo} ref={dropdownRef}>
      <button 
        className={styles.userButton} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={styles.userAvatar}>
          {user.nickname.charAt(0).toUpperCase()}
        </div>
        <div className={styles.userText}>
          <span className={styles.userName}>{user.nickname}</span>
          <span className={styles.userStatus}>
            <span className={styles.statusDot}></span>
            在线
          </span>
        </div>
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <div className={styles.dropdownHeaderTop}>
              <div className={styles.dropdownNickname}>{user.nickname}</div>
              <button 
                className={`${styles.refreshBtn} ${refreshing ? styles.refreshing : ''}`}
                onClick={handleRefresh}
                disabled={refreshing}
                title="刷新用户信息"
              >
                ↻
              </button>
            </div>
            <div className={styles.dropdownInfo}>账号：{user.account}</div>
            <div className={styles.dropdownInfo}>所属企业：{user.company}</div>
            <div className={styles.dropdownInfo}>所属部门：{user.department}</div>
          </div>

          <div className={styles.dropdownDivider} />

          <div className={styles.dropdownItem}>
            <span className={styles.dropdownItemLabel}>在线设备</span>
            <span className={styles.dropdownItemValue}>
              {user.online_count} / {user.login_limit}
            </span>
          </div>

          <div className={styles.dropdownDivider} />

          {/* 激活本机软件 - 仅非管理员显示 */}
          {!user.is_admin && onOpenActivateSoftware && (
            <div
              className={styles.dropdownAction}
              onClick={() => {
                setIsOpen(false)
                onOpenActivateSoftware()
              }}
            >
              <span className={styles.dropdownActionIcon}>💻</span>
              <span className={styles.dropdownActionText}>激活本机软件</span>
            </div>
          )}

          {/* 获取激活码 - 仅管理员显示 */}
          {user.is_admin && onOpenGenerateLicense && (
            <div
              className={styles.dropdownAction}
              onClick={() => {
                setIsOpen(false)
                onOpenGenerateLicense()
              }}
            >
              <span className={styles.dropdownActionIcon}>🎫</span>
              <span className={styles.dropdownActionText}>获取激活码</span>
            </div>
          )}

          {/* 用户管理 - 仅管理员显示 */}
          {user.is_admin && onOpenUserManagement && (
            <div
              className={styles.dropdownAction}
              onClick={() => {
                setIsOpen(false)
                onOpenUserManagement()
              }}
            >
              <span className={styles.dropdownActionIcon}>👥</span>
              <span className={styles.dropdownActionText}>用户管理</span>
            </div>
          )}

          <div
            className={styles.dropdownAction}
            onClick={() => {
              setIsOpen(false)
              onOpenChangePassword()
            }}
          >
            <span className={styles.dropdownActionIcon}>🔑</span>
            <span className={styles.dropdownActionText}>修改密码</span>
          </div>

          <div
            className={styles.dropdownAction}
            onClick={handleLogout}
          >
            <span className={styles.dropdownActionIcon}>🚪</span>
            <span className={styles.dropdownActionText}>退出登录</span>
          </div>

          <div className={styles.dropdownFooter}>
            <div className={styles.remainingDays}>
              <span className={styles.remainingDaysLabel}>剩余使用时间</span>
              <span className={`${styles.remainingDaysValue} ${getRemainingDaysClass(user.remaining_days)}`}>
                {user.remaining_days} 天
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
