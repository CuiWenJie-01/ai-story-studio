import { mkdir, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'
import { join, dirname } from '@tauri-apps/api/path'
import type { WorkItem, Seedance2Data } from '../types'

export interface ProjectData {
  version: string
  projectName: string
  projectPath: string
  createdAt: number
  updatedAt: number
  workItems: WorkItem[]
  activeWorkId: string | null
  seedance2Data?: Seedance2Data
  metadata: {
    totalShots: number
    completedShots: number
    lastActiveMode: 'image' | 'video' | 'lipsync' | 'voice' | 'seedance2'
  }
}

const PROJECT_DATA_FILE = 'project_data.json'
const BACKUP_FILE = 'project_data.backup.json'
const BACKUP_FOLDER = '保存备份'
const CURRENT_VERSION = '1.0.0'

// 格式化日期时间为文件名格式: YYYYMMDD_HHmmss
function formatDateTimeForFilename(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

class ProjectStorageService {
  private saveTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private pendingSaves: Map<string, ProjectData> = new Map()
  private isSaving: Map<string, boolean> = new Map()
  // 数据版本检查：记录每个项目的最后保存时间戳，防止旧数据覆盖新数据
  private lastSaveTimestamps: Map<string, number> = new Map()

  async ensureDir(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true })
    } catch (error) {
      console.error('[ProjectStorage] 创建目录失败:', error)
    }
  }

  getProjectDataPath(projectPath: string): string {
    return projectPath
  }

  async saveProjectData(projectPath: string, data: Omit<ProjectData, 'version' | 'updatedAt'>): Promise<boolean> {
    const filePath = await join(projectPath, PROJECT_DATA_FILE)
    
    const projectData: ProjectData = {
      ...data,
      version: CURRENT_VERSION,
      updatedAt: Date.now(),
    }

    this.pendingSaves.set(projectPath, projectData)

    const existingTimeout = this.saveTimeouts.get(projectPath)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(async () => {
        const pendingData = this.pendingSaves.get(projectPath)
        if (!pendingData) {
          resolve(false)
          return
        }

        if (this.isSaving.get(projectPath)) {
          this.saveTimeouts.set(projectPath, setTimeout(async () => {
            const result = await this.doSave(filePath, pendingData)
            resolve(result)
          }, 100))
          return
        }

        const result = await this.doSave(filePath, pendingData)
        resolve(result)
      }, 300)

      this.saveTimeouts.set(projectPath, timeout)
    })
  }

  private async doSave(filePath: string, data: ProjectData, retryCount: number = 0): Promise<boolean> {
    const projectPath = await dirname(filePath)
    this.isSaving.set(projectPath, true)

    const maxRetries = 3
    const retryDelay = 500 // 毫秒

    try {
      // 记录要保存的数据状态
      console.log(`[ProjectStorage] 准备写入文件: ${filePath}, workItems数量: ${data.workItems.length}`)
      
      // 数据版本检查：防止旧数据覆盖新数据
      const currentTimestamp = this.lastSaveTimestamps.get(projectPath) || 0
      if (data.updatedAt < currentTimestamp) {
        console.warn(`[ProjectStorage] 拒绝保存：数据版本过旧 (数据时间: ${data.updatedAt}, 最新时间: ${currentTimestamp})`)
        console.warn('[ProjectStorage] 这可能是由于竞态条件导致的，已跳过保存以保护数据')
        return false
      }
      
      if (data.workItems.length === 0) {
        console.warn('[ProjectStorage] 警告: 写入文件时 workItems 为空数组!')
        // 如果 workItems 为空，尝试从备份恢复
        const backupPath = await join(projectPath, BACKUP_FILE)
        const backupExists = await exists(backupPath)
        if (backupExists) {
          console.warn('[ProjectStorage] 检测到 workItems 为空，但备份文件存在，跳过保存以保护备份数据')
          return false
        }
      }
      
      // 先创建备份（如果原文件存在且有数据）
      const fileExists = await exists(filePath)
      if (fileExists && data.workItems.length > 0) {
        try {
          const existingData = await readTextFile(filePath)
          const parsed = JSON.parse(existingData) as ProjectData
          // 只有当现有文件有 workItems 时才备份
          if (parsed.workItems && parsed.workItems.length > 0) {
            // 1. 创建/更新基础备份文件
            const backupPath = await join(projectPath, BACKUP_FILE)
            await writeTextFile(backupPath, existingData)
            console.log('[ProjectStorage] 已创建基础备份文件:', backupPath)

            // 2. 创建带时间戳的备份到专门的备份目录
            const backupFolderPath = await join(projectPath, BACKUP_FOLDER)
            await this.ensureDir(backupFolderPath)

            const timestamp = formatDateTimeForFilename(data.updatedAt)
            const timestampedBackupPath = await join(backupFolderPath, `project_data_${timestamp}.json`)
            await writeTextFile(timestampedBackupPath, existingData)
            console.log('[ProjectStorage] 已创建时间戳备份文件:', timestampedBackupPath)
          }
        } catch (backupError) {
          console.warn('[ProjectStorage] 创建备份失败:', backupError)
          // 备份失败不阻止保存
        }
      }
      
      const jsonData = JSON.stringify(data, null, 2)
      await writeTextFile(filePath, jsonData)
      
      // 更新最后保存时间戳
      this.lastSaveTimestamps.set(projectPath, data.updatedAt)
      
      console.log(`[ProjectStorage] 项目数据已保存: ${filePath}, 包含 ${data.workItems.length} 个工作项`)
      this.pendingSaves.delete(projectPath)
      return true
    } catch (error) {
      console.error(`[ProjectStorage] 保存项目数据失败 (尝试 ${retryCount + 1}/${maxRetries}):`, error)
      
      // 如果还有重试次数，则延迟后重试
      if (retryCount < maxRetries - 1) {
        console.log(`[ProjectStorage] ${retryDelay}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        return this.doSave(filePath, data, retryCount + 1)
      }
      
      // 重试次数用尽，保存失败
      console.error('[ProjectStorage] 保存失败，已达到最大重试次数')
      return false
    } finally {
      this.isSaving.set(projectPath, false)
    }
  }

  async loadProjectData(projectPath: string, retryCount: number = 0): Promise<ProjectData | null> {
    const maxRetries = 3
    const retryDelay = 300 // 毫秒

    try {
      const filePath = await join(projectPath, PROJECT_DATA_FILE)
      const fileExists = await exists(filePath)
      
      if (!fileExists) {
        console.log('[ProjectStorage] 项目数据文件不存在:', filePath)
        return null
      }

      const jsonData = await readTextFile(filePath)
      
      // 检查文件内容是否为空
      if (!jsonData || jsonData.trim().length === 0) {
        console.error('[ProjectStorage] 项目数据文件为空:', filePath)
        return null
      }

      // 打印文件内容的前500字符用于调试
      console.log('[ProjectStorage] 文件内容预览:', jsonData.substring(0, 500))

      const data = JSON.parse(jsonData) as ProjectData
      
      // 验证数据完整性
      if (!data.workItems || !Array.isArray(data.workItems)) {
        console.error('[ProjectStorage] 项目数据格式不正确，缺少 workItems:', filePath)
        console.error('[ProjectStorage] 数据内容:', JSON.stringify(data).substring(0, 500))
        return null
      }
      
      // 检查 workItems 是否为空
      if (data.workItems.length === 0) {
        console.warn('[ProjectStorage] 警告: 加载的项目数据中 workItems 为空数组!')
        console.warn('[ProjectStorage] 项目信息:', {
          projectName: data.projectName,
          projectPath: data.projectPath,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          version: data.version
        })
        
        // 尝试从备份恢复
        try {
          const backupPath = await join(projectPath, BACKUP_FILE)
          const backupExists = await exists(backupPath)
          if (backupExists) {
            console.log('[ProjectStorage] 尝试从备份文件恢复...')
            const backupData = await readTextFile(backupPath)
            const backupProject = JSON.parse(backupData) as ProjectData
            if (backupProject.workItems && backupProject.workItems.length > 0) {
              console.log(`[ProjectStorage] 从备份恢复成功! 包含 ${backupProject.workItems.length} 个工作项`)
              return backupProject
            } else {
              console.warn('[ProjectStorage] 备份文件也存在空 workItems')
            }
          } else {
            console.warn('[ProjectStorage] 备份文件不存在，无法恢复')
          }
        } catch (backupError) {
          console.error('[ProjectStorage] 从备份恢复失败:', backupError)
        }
      }
      
      console.log('[ProjectStorage] 项目数据已加载:', filePath, `(${data.workItems.length} 个工作项)`)
      return data
    } catch (error) {
      console.error(`[ProjectStorage] 加载项目数据失败 (尝试 ${retryCount + 1}/${maxRetries}):`, error)
      
      // 如果是解析错误，不重试，直接返回 null
      if (error instanceof SyntaxError) {
        console.error('[ProjectStorage] JSON 解析错误，文件可能已损坏')
        return null
      }
      
      // 如果还有重试次数，则延迟后重试
      if (retryCount < maxRetries - 1) {
        console.log(`[ProjectStorage] ${retryDelay}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        return this.loadProjectData(projectPath, retryCount + 1)
      }
      
      console.error('[ProjectStorage] 加载失败，已达到最大重试次数')
      return null
    }
  }

  async projectDataExists(projectPath: string): Promise<boolean> {
    try {
      const filePath = await join(projectPath, PROJECT_DATA_FILE)
      return await exists(filePath)
    } catch {
      return false
    }
  }

  cancelPendingSave(projectPath: string): void {
    const timeout = this.saveTimeouts.get(projectPath)
    if (timeout) {
      clearTimeout(timeout)
      this.saveTimeouts.delete(projectPath)
    }
    this.pendingSaves.delete(projectPath)
  }

  async flushPendingSaves(): Promise<void> {
    const savePromises: Promise<boolean>[] = []
    
    for (const [projectPath, data] of this.pendingSaves) {
      const timeout = this.saveTimeouts.get(projectPath)
      if (timeout) {
        clearTimeout(timeout)
      }
      
      const filePath = await join(projectPath, PROJECT_DATA_FILE)
      savePromises.push(this.doSave(filePath, data))
    }

    await Promise.all(savePromises)
  }

  async saveImmediately(projectPath: string, data: Omit<ProjectData, 'version' | 'updatedAt'>): Promise<boolean> {
    const filePath = await join(projectPath, PROJECT_DATA_FILE)
    
    const projectData: ProjectData = {
      ...data,
      version: CURRENT_VERSION,
      updatedAt: Date.now(),
    }

    const existingTimeout = this.saveTimeouts.get(projectPath)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
      this.saveTimeouts.delete(projectPath)
    }

    return await this.doSave(filePath, projectData)
  }
}

export const projectStorageService = new ProjectStorageService()
