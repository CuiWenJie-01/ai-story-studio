import { RunningHubService } from './runningHubService'
import type { AccountStatus } from './runningHubService'
import type { ApiConfig, DemoScenario, RunningHubApiMapping } from '../types'

export interface QueueTaskOptions {
  demoScenario?: DemoScenario
}

export interface QueuedTask {
  id: string
  workItemId: string
  type: 'image' | 'video' | 'viewAngle'
  mapping: RunningHubApiMapping
  params: Record<string, unknown>
  onProgress?: (progress: number, message: string) => void
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled'
  backendTaskId?: string
  result?: {
    success: boolean
    taskId?: string
    outputUrl?: string
    error?: string
    cancelled?: boolean
    demo?: boolean
  }
  demoScenario?: DemoScenario
  addedAt: number
  startedAt?: number
  completedAt?: number
}

export interface TaskQueueState {
  queue: QueuedTask[]
  isProcessing: boolean
  currentRunningCount: number
  maxConcurrent: number
}

type TaskQueueListener = (state: TaskQueueState) => void
type TaskUpdateListener = (task: QueuedTask) => void

class TaskQueueManager {
  private queue: QueuedTask[] = []
  private isProcessing: boolean = false
  private maxConcurrent: number = 5
  private service: RunningHubService | null = null
  private listeners: Set<TaskQueueListener> = new Set()
  private taskListeners: Map<string, Set<TaskUpdateListener>> = new Map()
  private pollIntervalId: ReturnType<typeof setInterval> | null = null
  private activeTasks: Map<string, boolean> = new Map()
  private cancelledTasks: Set<string> = new Set()
  private lastConfigKey: string | null = null

  setMaxConcurrent(max: number): void {
    if (this.maxConcurrent === max) return
    
    this.maxConcurrent = max
    console.log(`[TaskQueue] 最大并发数设置为: ${max}`)
    this.notifyListeners()
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent
  }

  willBeQueued(): boolean {
    const pendingCount = this.queue.filter(t => t.status === 'pending').length
    const activeCount = this.activeTasks.size
    return (activeCount + pendingCount) >= this.maxConcurrent
  }

  async willBeQueuedAsync(isDemoTask: boolean = false): Promise<boolean> {
    const pendingCount = this.queue.filter(t => t.status === 'pending').length
    const activeCount = this.activeTasks.size
    
    let backendRunning = 0
    if (!isDemoTask && this.service) {
      try {
        const accountStatus = await this.service.getAccountStatus()
        if (accountStatus.success) {
          backendRunning = accountStatus.currentTaskCounts ?? 0
        }
      } catch (e) {
        console.warn('[TaskQueue] 获取后台任务数失败:', e)
      }
    }
    
    const effectiveRunning = Math.max(activeCount, backendRunning)
    console.log(`[TaskQueue] willBeQueuedAsync - 本地活跃: ${activeCount}, 后台运行: ${backendRunning}, 等待中: ${pendingCount}, 最大并发: ${this.maxConcurrent}`)
    
    return (effectiveRunning + pendingCount) >= this.maxConcurrent
  }

  setService(config: ApiConfig): void {
    const configKey = `${config.apiKey}-${config.endpoint}-${config.model || ''}`
    
    if (this.lastConfigKey === configKey && this.service) {
      return
    }
    
    this.service = new RunningHubService(config)
    this.lastConfigKey = configKey
    console.log('[TaskQueue] RunningHub 服务已配置')
  }

  subscribe(listener: TaskQueueListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeToTask(workItemId: string, listener: TaskUpdateListener): () => void {
    if (!this.taskListeners.has(workItemId)) {
      this.taskListeners.set(workItemId, new Set())
    }
    this.taskListeners.get(workItemId)!.add(listener)
    console.log(`[TaskQueue] 订阅任务更新: workItemId=${workItemId}, 当前订阅数: ${this.taskListeners.get(workItemId)!.size}`)
    
    return () => {
      this.taskListeners.get(workItemId)?.delete(listener)
      console.log(`[TaskQueue] 取消订阅: workItemId=${workItemId}, 剩余订阅数: ${this.taskListeners.get(workItemId)?.size || 0}`)
      if (this.taskListeners.get(workItemId)?.size === 0) {
        this.taskListeners.delete(workItemId)
      }
    }
  }

  private lastNotifiedState: string | null = null
  
  private notifyListeners(): void {
    const state = this.getState()
    const stateKey = JSON.stringify({
      queueLength: state.queue.length,
      processingCount: state.currentRunningCount,
      statuses: state.queue.map(t => `${t.id}:${t.status}`).join(',')
    })
    
    if (this.lastNotifiedState === stateKey) {
      return
    }
    
    this.lastNotifiedState = stateKey
    this.listeners.forEach(listener => listener(state))
  }
  
  private notifyTaskListeners(task: QueuedTask): void {
    const listeners = this.taskListeners.get(task.workItemId)
    console.log(`[TaskQueue] 通知任务监听器: workItemId=${task.workItemId}, taskId=${task.id}, status=${task.status}, 监听器数量=${listeners?.size || 0}`)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(task)
        } catch (error) {
          console.error(`[TaskQueue] 监听器错误:`, error)
        }
      })
    } else {
      console.warn(`[TaskQueue] 没有找到 workItemId=${task.workItemId} 的监听器`)
    }
  }

  getState(): TaskQueueState {
    return {
      queue: [...this.queue],
      isProcessing: this.isProcessing,
      currentRunningCount: this.activeTasks.size,
      maxConcurrent: this.maxConcurrent,
    }
  }
  
  getTaskByWorkItemId(workItemId: string): QueuedTask | undefined {
    return this.queue.find(t => t.workItemId === workItemId)
  }

  private generateId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }

  async addToQueue(
    workItemId: string,
    type: 'image' | 'video' | 'viewAngle',
    mapping: RunningHubApiMapping,
    params: Record<string, unknown>,
    onProgress?: (progress: number, message: string) => void,
    options?: QueueTaskOptions
  ): Promise<string> {
    const task: QueuedTask = {
      id: this.generateId(),
      workItemId,
      type,
      mapping,
      params,
      onProgress,
      demoScenario: options?.demoScenario,
      status: 'pending',
      addedAt: Date.now(),
    }

    this.queue.push(task)
    console.log(`[TaskQueue] 任务已加入队列: ${task.id}, workItemId: ${workItemId}, 类型: ${type}, 队列长度: ${this.queue.length}`)
    
    this.notifyListeners()
    
    this.processQueue()
    
    return task.id
  }

  removeTask(taskId: string): void {
    const task = this.queue.find(t => t.id === taskId)
    if (task) {
      if (task.status === 'processing') {
        this.cancelledTasks.add(taskId)
        task.status = 'cancelled'
        task.result = { success: false, cancelled: true, error: '任务已取消' }
        task.completedAt = Date.now()
        console.log(`[TaskQueue] 标记正在处理的任务为已取消: ${taskId}`)
        
        if (task.backendTaskId && this.service) {
          this.service.cancelTask(task.backendTaskId)
            .then((result) => {
              if (result.success) {
                console.log(`[TaskQueue] 后台任务已取消: ${task.backendTaskId}`)
              } else {
                console.warn(`[TaskQueue] 后台任务取消失败: ${result.error}`)
              }
            })
            .catch((err) => {
              console.error(`[TaskQueue] 后台任务取消异常:`, err)
            })
        }
      } else {
        const index = this.queue.findIndex(t => t.id === taskId)
        if (index !== -1) {
          this.queue.splice(index, 1)
          console.log(`[TaskQueue] 任务已从队列移除: ${taskId}`)
        }
      }
      this.notifyListeners()
    }
  }

  async cancelTaskAndWait(taskId: string): Promise<{ success: boolean; error?: string }> {
    const task = this.queue.find(t => t.id === taskId)
    if (!task) {
      return { success: false, error: '任务不存在' }
    }

    if (task.status === 'pending') {
      const index = this.queue.findIndex(t => t.id === taskId)
      if (index !== -1) {
        this.queue.splice(index, 1)
        task.status = 'cancelled'
        task.completedAt = Date.now()
        console.log(`[TaskQueue] 待处理任务已取消: ${taskId}`)
      }
      this.notifyListeners()
      return { success: true }
    }

    if (task.status === 'processing') {
      this.cancelledTasks.add(taskId)
      
      if (task.backendTaskId && this.service) {
        try {
          const result = await this.service.cancelTask(task.backendTaskId)
          if (result.success) {
            console.log(`[TaskQueue] 后台任务已取消: ${task.backendTaskId}`)
            task.status = 'cancelled'
            task.result = { success: false, cancelled: true, error: '任务已取消' }
            task.completedAt = Date.now()
            this.notifyListeners()
            return { success: true }
          } else {
            console.warn(`[TaskQueue] 后台任务取消失败: ${result.error}`)
            return { success: false, error: result.error }
          }
        } catch (err) {
          console.error(`[TaskQueue] 后台任务取消异常:`, err)
          return { success: false, error: err instanceof Error ? err.message : '取消失败' }
        }
      } else {
        task.status = 'cancelled'
        task.result = { success: false, cancelled: true, error: '任务已取消' }
        task.completedAt = Date.now()
        this.notifyListeners()
        return { success: true }
      }
    }

    return { success: false, error: '任务已完成或已取消' }
  }

  isTaskCancelled(taskId: string): boolean {
    return this.cancelledTasks.has(taskId)
  }

  clearQueue(): void {
    const pendingTasks = this.queue.filter(t => t.status === 'pending')
    this.queue = this.queue.filter(t => t.status !== 'pending')
    console.log(`[TaskQueue] 已清除 ${pendingTasks.length} 个待处理任务`)
    this.notifyListeners()
  }

  private async checkAccountStatus(): Promise<AccountStatus> {
    if (!this.service) {
      return { success: false, error: 'RunningHub 服务未配置' }
    }
    return this.service.getAccountStatus()
  }

  private async waitForDemoStep(milliseconds: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, milliseconds))
  }

  private async executeDemoTask(
    task: QueuedTask,
    checkCancelled: () => boolean
  ): Promise<NonNullable<QueuedTask['result']>> {
    const scenario = task.demoScenario || 'success'
    const report = async (progress: number, message: string, waitMs: number = 900) => {
      if (checkCancelled()) return false
      task.onProgress?.(progress, message)
      await this.waitForDemoStep(waitMs)
      return !checkCancelled()
    }

    const commonStages: Array<[number, string, number?]> = [
      [8, '本地演示：正在创建后台任务...'],
      [20, '本地演示：任务已提交，等待处理...'],
      [38, '本地演示：后台任务处理中...'],
    ]

    for (const [progress, message, waitMs] of commonStages) {
      if (!(await report(progress, message, waitMs))) {
        return { success: false, cancelled: true, error: '任务已取消', demo: true }
      }
    }

    if (scenario === 'recover' || scenario === 'failure') {
      if (!(await report(42, '模拟网络异常，正在重试 (1/2)...', 1800))) {
        return { success: false, cancelled: true, error: '任务已取消', demo: true }
      }

      if (scenario === 'failure') {
        if (!(await report(42, '模拟网络异常，正在重试 (2/2)...', 1800))) {
          return { success: false, cancelled: true, error: '任务已取消', demo: true }
        }
        return {
          success: false,
          error: '本地演示：连续重试 2 次后任务失败',
          demo: true,
        }
      }

      if (!(await report(48, '网络已恢复，继续查询原任务...', 1200))) {
        return { success: false, cancelled: true, error: '任务已取消', demo: true }
      }
    }

    const finishingStages: Array<[number, string, number?]> = [
      [62, '本地演示：生成处理中...'],
      [80, '本地演示：正在整理生成结果...'],
      [94, '本地演示：正在保存状态...'],
    ]

    for (const [progress, message, waitMs] of finishingStages) {
      if (!(await report(progress, message, waitMs))) {
        return { success: false, cancelled: true, error: '任务已取消', demo: true }
      }
    }

    task.onProgress?.(100, '本地演示：任务完成')
    return {
      success: true,
      taskId: `demo-backend-${task.id}`,
      outputUrl: `demo://${task.type}/${task.id}`,
      demo: true,
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('[TaskQueue] 队列正在处理中，跳过')
      return
    }

    this.isProcessing = true
    console.log('[TaskQueue] 开始处理队列...')

    try {
      let consecutiveErrors = 0
      const maxConsecutiveErrors = 3

      while (true) {
        const pendingTasks = this.queue.filter(t => t.status === 'pending')
        
        if (pendingTasks.length === 0) {
          console.log('[TaskQueue] 没有待处理任务')
          break
        }

        const nextTask = pendingTasks[0]
        const localActiveCount = this.activeTasks.size
        let effectiveRunning = localActiveCount

        if (nextTask.demoScenario) {
          consecutiveErrors = 0
          console.log(`[TaskQueue] 本地演示任务并发检查 - 活跃: ${localActiveCount}, 最大并发: ${this.maxConcurrent}`)
        } else {
          const accountStatus = await this.checkAccountStatus()
          
          if (!accountStatus.success) {
            consecutiveErrors++
            console.error(`[TaskQueue] 获取账户状态失败 (${consecutiveErrors}/${maxConsecutiveErrors}):`, accountStatus.error)

            if (consecutiveErrors >= maxConsecutiveErrors) {
              console.error('[TaskQueue] 连续获取账户状态失败次数过多，停止处理')
              for (const task of pendingTasks.filter(t => !t.demoScenario)) {
                task.status = 'error'
                task.result = { success: false, error: '无法获取账户状态，请检查网络连接和API配置' }
                this.notifyTaskListeners(task)
              }
              continue
            }

            await new Promise(resolve => setTimeout(resolve, 5000))
            continue
          }
          
          consecutiveErrors = 0
          const currentRunning = accountStatus.currentTaskCounts ?? 0
          effectiveRunning = Math.max(currentRunning, localActiveCount)
          console.log(`[TaskQueue] 当前后台运行任务数: ${currentRunning}, 本地活跃任务: ${localActiveCount}, 最大并发: ${this.maxConcurrent}`)
        }
        
        if (effectiveRunning >= this.maxConcurrent) {
          console.log(`[TaskQueue] 已达到最大并发数 (${effectiveRunning}/${this.maxConcurrent})，等待中...`)
          
          if (!this.pollIntervalId) {
            this.startPolling()
          }
          break
        }

        console.log(`[TaskQueue] 准备执行任务: ${nextTask.id}, workItemId: ${nextTask.workItemId}`)
        
        this.activeTasks.set(nextTask.id, true)
        this.executeTask(nextTask)
        
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } finally {
      this.isProcessing = false
      this.notifyListeners()
    }
  }

  private async executeTask(task: QueuedTask): Promise<void> {
    const service = this.service

    if (!task.demoScenario && !service) {
      task.status = 'error'
      task.result = { success: false, error: 'RunningHub 服务未配置' }
      this.activeTasks.delete(task.id)
      this.notifyTaskListeners(task)
      this.notifyListeners()
      return
    }

    task.status = 'processing'
    task.startedAt = Date.now()
    console.log(`[TaskQueue] 开始执行任务: ${task.id}, workItemId: ${task.workItemId}`)
    
    this.notifyTaskListeners(task)
    this.notifyListeners()

    try {
      let result

      const checkCancelled = () => this.cancelledTasks.has(task.id)
      
      const onTaskSubmitted = (backendTaskId: string) => {
        task.backendTaskId = backendTaskId
        console.log(`[TaskQueue] 后台任务ID已保存: ${backendTaskId}`)
        this.notifyTaskListeners(task)
        this.notifyListeners()
        
        if (checkCancelled()) {
          console.log(`[TaskQueue] 任务在提交后立即被取消，尝试取消后台任务`)
          service?.cancelTask(backendTaskId).catch(err => {
            console.error(`[TaskQueue] 取消后台任务失败:`, err)
          })
        }
      }

      if (checkCancelled()) {
        task.status = 'cancelled'
        task.result = { success: false, cancelled: true, error: '任务已取消' }
        task.completedAt = Date.now()
        console.log(`[TaskQueue] 任务在开始前已被取消: ${task.id}`)
        this.notifyTaskListeners(task)
        return
      }

      if (task.demoScenario) {
        result = await this.executeDemoTask(task, checkCancelled)
      } else if (!service) {
        result = { success: false, error: 'RunningHub 服务未配置' }
      } else if (task.type === 'image') {
        result = await service.generateImage(
          task.mapping,
          task.params as Parameters<RunningHubService['generateImage']>[1],
          task.onProgress,
          checkCancelled,
          onTaskSubmitted
        )
      } else if (task.type === 'video') {
        result = await service.generateVideo(
          task.mapping,
          task.params as Parameters<RunningHubService['generateVideo']>[1],
          task.onProgress,
          checkCancelled,
          onTaskSubmitted
        )
      } else if (task.type === 'viewAngle') {
        const submitResult = await service.submitViewAngleTask(
          task.mapping,
          task.params as Parameters<RunningHubService['submitViewAngleTask']>[1]
        )
        
        if (submitResult.success && submitResult.taskId) {
          task.backendTaskId = submitResult.taskId
          result = await service.waitForCompletion(
            submitResult.taskId,
            task.onProgress,
            5000,
            300000,
            checkCancelled
          )
        } else {
          result = { success: false, error: submitResult.error }
        }
      } else {
        result = { success: false, error: '未知任务类型' }
      }

      if (checkCancelled()) {
        task.status = 'cancelled'
        task.result = { success: false, cancelled: true, error: '任务已取消' }
        task.completedAt = Date.now()
        console.log(`[TaskQueue] 任务在执行过程中被取消: ${task.id}`)
        this.notifyTaskListeners(task)
        return
      }

      task.status = result.success ? 'completed' : (result.cancelled ? 'cancelled' : 'error')
      task.result = result
      task.completedAt = Date.now()
      
      console.log(`[TaskQueue] 任务完成: ${task.id}, 状态: ${task.status}`)
      
      this.notifyTaskListeners(task)
      
      if (result.success && result.outputUrl) {
        console.log(`[TaskQueue] 输出URL: ${result.outputUrl}`)
      } else if (result.cancelled) {
        console.log(`[TaskQueue] 任务已取消: ${task.id}`)
      } else if (!result.success) {
        console.error(`[TaskQueue] 任务失败: ${result.error}`)
      }
    } catch (error) {
      task.status = 'error'
      task.result = { 
        success: false, 
        error: error instanceof Error ? error.message : '未知错误' 
      }
      task.completedAt = Date.now()
      console.error(`[TaskQueue] 任务异常: ${task.id}`, error)
      this.notifyTaskListeners(task)
    } finally {
      this.activeTasks.delete(task.id)
      this.cancelledTasks.delete(task.id)
      this.notifyListeners()
      
      this.processQueue()
    }
  }

  private startPolling(): void {
    if (this.pollIntervalId) {
      return
    }

    console.log('[TaskQueue] 启动轮询检查...')
    
    this.pollIntervalId = setInterval(() => {
      const pendingTasks = this.queue.filter(t => t.status === 'pending')
      const processingTasks = this.queue.filter(t => t.status === 'processing')
      
      if (pendingTasks.length > 0 || processingTasks.length > 0) {
        console.log('[TaskQueue] 轮询检查队列...')
        this.processQueue()
      } else {
        this.stopPolling()
      }
    }, 5000)
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
      console.log('[TaskQueue] 停止轮询')
    }
  }

  getQueueLength(): number {
    return this.queue.filter(t => t.status === 'pending').length
  }

  getActiveTaskCount(): number {
    return this.activeTasks.size
  }

  getTaskById(taskId: string): QueuedTask | undefined {
    return this.queue.find(t => t.id === taskId)
  }

  getAllTasks(): QueuedTask[] {
    return [...this.queue]
  }
}

export const taskQueueManager = new TaskQueueManager()

export default taskQueueManager
