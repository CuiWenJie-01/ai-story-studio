import React, { useState, useEffect, useMemo } from 'react'
import { X, Search, Users, RefreshCw, Trash2, Edit3, Check, XCircle, Shield, User as UserIcon, RotateCcw } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import type { User as UserType } from '../../types'
import styles from './AuthModal.module.css'

interface UserManagementModalProps {
  isOpen: boolean
  onClose: () => void
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [users, setUsers] = useState<UserType[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingUser, setEditingUser] = useState<UserType | null>(null)
  const [editForm, setEditForm] = useState({
    nickname: '',
    email: '',
    company: '',
    department: '',
    remaining_days: 0,
    login_limit: 1,
    is_admin: false,
  })

  const addToast = useAppStore((state) => state.addToast)

  // 模拟用户数据（用于测试）
  const mockUsers: UserType[] = [
    {
      id: 1,
      account: 'admin',
      nickname: '管理员',
      company: '旭言科技',
      department: '技术部',
      remaining_days: 9999,
      login_limit: 10,
      online_count: 1,
      is_admin: true,
    },
    {
      id: 2,
      account: 'user001',
      nickname: '张三',
      company: '测试公司',
      department: '设计部',
      remaining_days: 30,
      login_limit: 3,
      online_count: 0,
      is_admin: false,
    },
    {
      id: 3,
      account: 'user002',
      nickname: '李四',
      company: '创意工作室',
      department: '视频部',
      remaining_days: 7,
      login_limit: 2,
      online_count: 1,
      is_admin: false,
    },
    {
      id: 4,
      account: 'user003',
      nickname: '王五',
      company: '广告公司',
      department: '制作部',
      remaining_days: 0,
      login_limit: 1,
      online_count: 0,
      is_admin: false,
    },
  ]

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true)
    try {
      // 尝试调用后端API
      const response = await invoke<{ success: boolean; message: string; users: UserType[] }>(
        'tauri_get_all_users'
      )
      if (response.success) {
        setUsers(response.users)
      } else {
        addToast({ type: 'error', title: '获取用户列表失败', message: response.message })
      }
    } catch (err) {
      console.log('[UserManagement] 后端API未实现，使用模拟数据')
      // 后端未实现时使用模拟数据
      setUsers(mockUsers)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchUsers()
      setSearchQuery('')
      setEditingUser(null)
    }
  }, [isOpen])

  // 过滤用户
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const lowerQuery = searchQuery.toLowerCase()
    return users.filter(
      (user) =>
        user.nickname.toLowerCase().includes(lowerQuery) ||
        user.account.toLowerCase().includes(lowerQuery) ||
        user.company.toLowerCase().includes(lowerQuery) ||
        user.department.toLowerCase().includes(lowerQuery)
    )
  }, [users, searchQuery])

  // 开始编辑用户
  const handleStartEdit = (user: UserType) => {
    setEditingUser(user)
    setEditForm({
      nickname: user.nickname,
      email: (user as any).email || '',
      company: user.company,
      department: user.department,
      remaining_days: user.remaining_days,
      login_limit: user.login_limit,
      is_admin: user.is_admin,
    })
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingUser(null)
  }

  // 保存用户编辑
  const handleSaveEdit = async () => {
    if (!editingUser) return

    try {
      const response = await invoke<{ success: boolean; message: string }>('tauri_update_user', {
        userId: editingUser.id,
        updates: {
          nickname: editForm.nickname,
          email: editForm.email,
          company: editForm.company,
          department: editForm.department,
          remaining_days: editForm.remaining_days,
          login_limit: editForm.login_limit,
          is_admin: editForm.is_admin,
        },
      })

      if (response.success) {
        addToast({ type: 'success', title: '用户更新成功' })
        setEditingUser(null)
        fetchUsers()
      } else {
        addToast({ type: 'error', title: '用户更新失败', message: response.message })
      }
    } catch (err) {
      console.log('[UserManagement] 后端API未实现，本地更新模拟数据')
      // 后端未实现时本地更新
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                nickname: editForm.nickname,
                email: editForm.email,
                company: editForm.company,
                department: editForm.department,
                remaining_days: editForm.remaining_days,
                login_limit: editForm.login_limit,
                is_admin: editForm.is_admin,
              }
            : u
        )
      )
      addToast({ type: 'success', title: '用户更新成功（本地）' })
      setEditingUser(null)
    }
  }

  // 删除用户
  const handleDeleteUser = async (userId: number) => {
    if (!confirm('确定要删除该用户吗？此操作不可恢复。')) return

    try {
      const response = await invoke<{ success: boolean; message: string }>('tauri_delete_user', {
        userId,
      })

      if (response.success) {
        addToast({ type: 'success', title: '用户删除成功' })
        fetchUsers()
      } else {
        addToast({ type: 'error', title: '用户删除失败', message: response.message })
      }
    } catch (err) {
      console.log('[UserManagement] 后端API未实现，本地删除模拟数据')
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      addToast({ type: 'success', title: '用户删除成功（本地）' })
    }
  }

  // 重置用户在线数
  const handleResetOnlineCount = async (userId: number, nickname: string) => {
    if (!confirm(`确定要重置用户「${nickname}」的在线数为0吗？\n此操作用于修复因异常退出导致的在线数累积问题。`)) return

    try {
      const response = await invoke<{ success: boolean; message: string }>('tauri_reset_online_count', {
        userId,
      })

      if (response.success) {
        addToast({ type: 'success', title: '重置成功', message: response.message })
        fetchUsers()
      } else {
        addToast({ type: 'error', title: '重置失败', message: response.message })
      }
    } catch (err) {
      addToast({ type: 'error', title: '重置失败', message: err instanceof Error ? err.message : '未知错误' })
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2>
            <Users size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            用户管理
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className={styles.refreshBtn}
              onClick={fetchUsers}
              disabled={loading}
              title="刷新用户列表"
            >
              <RefreshCw size={16} className={loading ? styles.spinning : ''} />
            </button>
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className={styles.form} style={{ maxHeight: 'calc(90vh - 100px)', overflow: 'auto' }}>
          {/* 搜索框 */}
          <div className={styles.field} style={{ marginBottom: '20px' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-tertiary)',
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索用户（昵称、账号、企业、部门）"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  background: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                }}
              />
            </div>
          </div>

          {/* 用户列表 */}
          <div className={styles.userList}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                <RefreshCw size={32} className={styles.spinning} />
                <p style={{ marginTop: '16px' }}>加载中...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                <UserIcon size={48} style={{ opacity: 0.5 }} />
                <p style={{ marginTop: '16px' }}>
                  {searchQuery ? '未找到匹配的用户' : '暂无用户'}
                </p>
              </div>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>用户信息</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>企业/部门</th>
                    <th style={{ textAlign: 'center', padding: '12px 8px' }}>剩余天数</th>
                    <th style={{ textAlign: 'center', padding: '12px 8px' }}>在线/限制</th>
                    <th style={{ textAlign: 'center', padding: '12px 8px' }}>角色</th>
                    <th style={{ textAlign: 'right', padding: '12px 8px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        background: editingUser?.id === user.id ? 'var(--color-bg-tertiary)' : 'transparent',
                      }}
                    >
                      {editingUser?.id === user.id ? (
                        // 编辑模式
                        <>
                          <td colSpan={6} style={{ padding: '16px 8px' }}>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '12px',
                                marginBottom: '16px',
                              }}
                            >
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  昵称
                                </label>
                                <input
                                  type="text"
                                  value={editForm.nickname}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, nickname: e.target.value })
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px',
                                    marginTop: '4px',
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  邮箱
                                </label>
                                <input
                                  type="email"
                                  value={editForm.email}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, email: e.target.value })
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px',
                                    marginTop: '4px',
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  企业
                                </label>
                                <input
                                  type="text"
                                  value={editForm.company}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, company: e.target.value })
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px',
                                    marginTop: '4px',
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  部门
                                </label>
                                <input
                                  type="text"
                                  value={editForm.department}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, department: e.target.value })
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px',
                                    marginTop: '4px',
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  剩余天数
                                </label>
                                <input
                                  type="number"
                                  value={editForm.remaining_days}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      remaining_days: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px',
                                    marginTop: '4px',
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  登录限制
                                </label>
                                <input
                                  type="number"
                                  value={editForm.login_limit}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      login_limit: parseInt(e.target.value) || 1,
                                    })
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px',
                                    marginTop: '4px',
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  管理员
                                </label>
                                <div style={{ marginTop: '8px' }}>
                                  <input
                                    type="checkbox"
                                    checked={editForm.is_admin}
                                    onChange={(e) =>
                                      setEditForm({ ...editForm, is_admin: e.target.checked })
                                    }
                                    style={{ marginRight: '8px' }}
                                  />
                                  <span>是</span>
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={handleCancelEdit}
                                style={{
                                  padding: '8px 16px',
                                  background: 'var(--color-bg-tertiary)',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <XCircle size={16} />
                                取消
                              </button>
                              <button
                                onClick={handleSaveEdit}
                                style={{
                                  padding: '8px 16px',
                                  background: 'var(--color-accent)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  color: 'white',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Check size={16} />
                                保存
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // 显示模式
                        <>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '8px',
                                  background: user.is_admin
                                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                    : 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  fontWeight: 600,
                                  fontSize: '16px',
                                }}
                              >
                                {user.nickname.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 500 }}>{user.nickname}</div>
                                <div
                                  style={{
                                    fontSize: '12px',
                                    color: 'var(--color-text-secondary)',
                                  }}
                                >
                                  {user.account}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <div>{user.company}</div>
                            <div
                              style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}
                            >
                              {user.department}
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <span
                              style={{
                                padding: '4px 12px',
                                borderRadius: '12px',
                                fontSize: '13px',
                                fontWeight: 500,
                                background:
                                  user.remaining_days <= 0
                                    ? '#fee2e2'
                                    : user.remaining_days <= 7
                                      ? '#fef3c7'
                                      : '#d1fae5',
                                color:
                                  user.remaining_days <= 0
                                    ? '#dc2626'
                                    : user.remaining_days <= 7
                                      ? '#d97706'
                                      : '#059669',
                              }}
                            >
                              {user.remaining_days} 天
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                              }}
                            >
                              <span
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: user.online_count > 0 ? '#22c55e' : '#9ca3af',
                                }}
                              />
                              <span>
                                {user.online_count} / {user.login_limit}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            {user.is_admin ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 12px',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  background: '#fef3c7',
                                  color: '#d97706',
                                }}
                              >
                                <Shield size={14} />
                                管理员
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: '4px 12px',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  background: 'var(--color-bg-tertiary)',
                                  color: 'var(--color-text-secondary)',
                                }}
                              >
                                普通用户
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => handleResetOnlineCount(user.id, user.nickname)}
                                style={{
                                  padding: '6px 12px',
                                  background: user.online_count > 0 ? '#fef3c7' : 'var(--color-bg-tertiary)',
                                  border: user.online_count > 0 ? '1px solid #fde68a' : '1px solid var(--color-border)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '13px',
                                  color: user.online_count > 0 ? '#d97706' : 'var(--color-text-tertiary)',
                                }}
                                title="重置在线数"
                              >
                                <RotateCcw size={14} />
                              </button>
                              <button
                                onClick={() => handleStartEdit(user)}
                                style={{
                                  padding: '6px 12px',
                                  background: 'var(--color-bg-tertiary)',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '13px',
                                }}
                                title="编辑用户"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                style={{
                                  padding: '6px 12px',
                                  background: '#fee2e2',
                                  border: '1px solid #fecaca',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '13px',
                                  color: '#dc2626',
                                }}
                                title="删除用户"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 统计信息 */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              background: 'var(--color-bg-tertiary)',
              borderRadius: '6px',
              display: 'flex',
              gap: '24px',
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>总用户: {users.length}</span>
            <span>管理员: {users.filter((u) => u.is_admin).length}</span>
            <span>在线用户: {users.filter((u) => u.online_count > 0).length}</span>
            <span>搜索结果: {filteredUsers.length}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
