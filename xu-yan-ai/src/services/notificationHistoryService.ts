import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

export interface NotificationRecord {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  timestamp: number
  shotNumber?: string
}

const MAX_RECORDS = 50
const NOTIFICATION_FILE = 'notification_history.json'

export class NotificationHistoryService {
  private basePath: string | null = null
  private records: NotificationRecord[] = []
  private initialized: boolean = false

  async init(basePath: string): Promise<void> {
    if (this.basePath === basePath && this.initialized) return
    
    this.basePath = basePath
    await this.loadFromFile()
    this.initialized = true
  }

  private async getFilePath(): Promise<string> {
    if (!this.basePath) throw new Error('Base path not set')
    return `${this.basePath}\\${NOTIFICATION_FILE}`
  }

  private async loadFromFile(): Promise<void> {
    if (!this.basePath) return

    try {
      const filePath = await this.getFilePath()
      const fileExists = await exists(filePath)
      
      if (fileExists) {
        const content = await readTextFile(filePath)
        this.records = JSON.parse(content)
        console.log(`[NotificationHistory] 已加载 ${this.records.length} 条历史记录`)
      } else {
        this.records = []
        console.log('[NotificationHistory] 历史记录文件不存在，初始化为空')
      }
    } catch (err) {
      console.error('[NotificationHistory] 加载历史记录失败:', err)
      this.records = []
    }
  }

  private async saveToFile(): Promise<void> {
    if (!this.basePath) return

    try {
      const filePath = await this.getFilePath()
      await writeTextFile(filePath, JSON.stringify(this.records, null, 2))
    } catch (err) {
      console.error('[NotificationHistory] 保存历史记录失败:', err)
    }
  }

  async addRecord(record: Omit<NotificationRecord, 'id' | 'timestamp'>): Promise<void> {
    const newRecord: NotificationRecord = {
      ...record,
      id: `notify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    }

    this.records.unshift(newRecord)

    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(0, MAX_RECORDS)
    }

    await this.saveToFile()
    console.log(`[NotificationHistory] 添加记录: ${record.title}`)
  }

  getRecords(): NotificationRecord[] {
    return [...this.records]
  }

  async clearRecords(): Promise<void> {
    this.records = []
    await this.saveToFile()
    console.log('[NotificationHistory] 已清空所有历史记录')
  }

  async deleteRecord(id: string): Promise<void> {
    this.records = this.records.filter(r => r.id !== id)
    await this.saveToFile()
  }
}

export const notificationHistoryService = new NotificationHistoryService()
