import { invoke } from '@tauri-apps/api/core'
import type { User } from '../types'

export interface AuthResponse {
  success: boolean
  message: string
  user: User | null
}

const INSTANCE_ID_KEY = 'xuyan_instance_id'

function getInstanceId(): string {
  let instanceId = localStorage.getItem(INSTANCE_ID_KEY)
  if (!instanceId) {
    instanceId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
    localStorage.setItem(INSTANCE_ID_KEY, instanceId)
  }
  return instanceId
}

export const authService = {
  getInstanceId,

  async login(account: string, password: string): Promise<AuthResponse> {
    console.log('[Auth] 尝试登录:', account)
    try {
      const response = await invoke<AuthResponse>('tauri_login', {
        account,
        password,
        instanceId: getInstanceId(),
      })
      console.log('[Auth] 登录结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 登录失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '登录失败',
        user: null,
      }
    }
  },

  async register(
    nickname: string,
    account: string,
    password: string,
    company: string,
    department: string
  ): Promise<AuthResponse> {
    console.log('[Auth] 尝试注册:', account)
    try {
      const response = await invoke<AuthResponse>('tauri_register', {
        nickname,
        account,
        password,
        company,
        department,
      })
      console.log('[Auth] 注册结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 注册失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '注册失败',
        user: null,
      }
    }
  },

  async logout(account: string): Promise<AuthResponse> {
    console.log('[Auth] 尝试退出登录:', account)
    try {
      const response = await invoke<AuthResponse>('tauri_logout', {
        account,
        instanceId: getInstanceId(),
      })
      console.log('[Auth] 退出登录结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 退出登录失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '退出登录失败',
        user: null,
      }
    }
  },

  async changePassword(
    account: string,
    oldPassword: string,
    newPassword: string
  ): Promise<AuthResponse> {
    console.log('[Auth] 尝试修改密码:', account)
    try {
      const response = await invoke<AuthResponse>('tauri_change_password', {
        account,
        oldPassword,
        newPassword,
      })
      console.log('[Auth] 修改密码结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 修改密码失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '修改密码失败',
        user: null,
      }
    }
  },

  async getUserInfo(account: string): Promise<AuthResponse> {
    console.log('[Auth] 获取用户信息:', account)
    try {
      const response = await invoke<AuthResponse>('tauri_get_user_info', {
        account,
      })
      console.log('[Auth] 获取用户信息结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 获取用户信息失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '获取用户信息失败',
        user: null,
      }
    }
  },

  async verifyCredentials(account: string, password: string): Promise<AuthResponse> {
    console.log('[Auth] 验证用户凭证:', account)
    try {
      const response = await invoke<AuthResponse>('tauri_verify_credentials', {
        account,
        password,
      })
      console.log('[Auth] 凭证验证结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 凭证验证失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '凭证验证失败',
        user: null,
      }
    }
  },

  async checkNetwork(): Promise<boolean> {
    console.log('[Auth] 检测网络连接...')
    try {
      const response = await invoke<boolean>('tauri_check_network')
      console.log('[Auth] 网络检测结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 网络检测失败:', error)
      return false
    }
  },

  async quickCheckConnection(): Promise<{ success: boolean; message: string }> {
    console.log('[Auth] 快速检测数据库连接...')
    try {
      await invoke('tauri_quick_check_connection')
      console.log('[Auth] 快速检测成功')
      return { success: true, message: '连接正常' }
    } catch (error) {
      console.error('[Auth] 快速检测失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败',
      }
    }
  },

  async verifyUserStatus(account: string, storedHash: string): Promise<{ valid: boolean; message: string }> {
    console.log('[Auth] 验证用户状态:', account)
    try {
      const isValid = await invoke<boolean>('tauri_verify_user_status', { account, storedHash })
      if (isValid) {
        return { valid: true, message: '用户有效' }
      } else {
        return { valid: false, message: '用户不存在或密码已修改' }
      }
    } catch (error) {
      console.error('[Auth] 验证用户状态失败:', error)
      return {
        valid: false,
        message: error instanceof Error ? error.message : '验证失败',
      }
    }
  },

  async forceLogout(account: string): Promise<{ success: boolean; message: string }> {
    console.log('[Auth] 强制退出登录:', account)
    try {
      const response = await invoke<{ success: boolean; message: string }>('tauri_force_logout', { account, instanceId: getInstanceId() })
      console.log('[Auth] 强制退出登录结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 强制退出登录失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '强制退出失败',
      }
    }
  },

  async resetOnlineCount(userId: number): Promise<{ success: boolean; message: string }> {
    console.log('[Auth] 重置用户在线数:', userId)
    try {
      const response = await invoke<{ success: boolean; message: string }>('tauri_reset_online_count', { userId })
      console.log('[Auth] 重置在线数结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 重置在线数失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '重置失败',
      }
    }
  },

  async restoreSession(account: string): Promise<AuthResponse> {
    console.log('[Auth] 恢复会话:', account)
    try {
      const response = await invoke<AuthResponse>('tauri_restore_session', { account, instanceId: getInstanceId() })
      console.log('[Auth] 恢复会话结果:', response)
      return response
    } catch (error) {
      console.error('[Auth] 恢复会话失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '恢复会话失败',
        user: null,
      }
    }
  },
}
