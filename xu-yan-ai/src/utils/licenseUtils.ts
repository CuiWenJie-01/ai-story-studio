/**
 * 软件授权验证工具
 * 包含机器码生成、激活码生成和验证功能
 */

import { invoke } from '@tauri-apps/api/core'

// 密钥常量
const SECRET_KEY = 'XuYanAI_2025_Secure_License_System_v2'

/**
 * 获取或生成稳定的机器标识
 */
async function getStableMachineId(): Promise<string> {
  try {
    const machineId = await invoke<string>('tauri_get_machine_id')
    return machineId
  } catch {
    let machineId = localStorage.getItem('xuyan_machine_id')
    if (!machineId) {
      machineId = generateRandomId()
      localStorage.setItem('xuyan_machine_id', machineId)
    }
    return machineId
  }
}

/**
 * 生成随机机器标识
 */
function generateRandomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 生成机器码
 */
export async function generateMachineCode(): Promise<string> {
  const machineId = await getStableMachineId()
  const hash = await sha256(machineId + SECRET_KEY)
  return formatCode(hash.substring(0, 16).toUpperCase())
}

/**
 * 格式化代码为易读格式 XXXX-XXXX-XXXX-XXXX
 */
function formatCode(raw: string): string {
  const parts = []
  for (let i = 0; i < raw.length; i += 4) {
    parts.push(raw.substring(i, i + 4))
  }
  return parts.join('-')
}

/**
 * 从机器码生成激活码
 * 使用简单的可逆算法，确保同一机器码始终生成相同的激活码
 */
export function generateActivationCode(machineCode: string): string {
  // 移除分隔符
  const cleanCode = machineCode.replace(/-/g, '')
  
  // 简单的替换算法：每个字符按固定规则转换
  const transformed = cleanCode.split('').map((char, index) => {
    const charCode = char.charCodeAt(0)
    // 使用固定的偏移量，基于字符位置和密钥
    const offset = ((index * 7 + 13) % 36)
    // 将字符转换为 0-35 的数字
    let num = charCodeToNum(charCode)
    // 应用偏移
    num = (num + offset) % 36
    // 转换回字符
    return numToCharCode(num)
  }).join('')
  
  // 添加校验位（所有字符的和）
  const checksum = calculateSimpleChecksum(cleanCode)
  const withChecksum = transformed + numToCharCode(checksum % 36) + numToCharCode(Math.floor(checksum / 36) % 36)
  
  // 添加前缀并格式化
  const finalCode = 'XY' + withChecksum
  return formatCode(finalCode)
}

/**
 * 验证激活码是否匹配机器码
 */
export function verifyActivationCode(machineCode: string, activationCode: string): boolean {
  try {
    // 移除分隔符
    const cleanActivation = activationCode.replace(/-/g, '').replace(/^XY/, '')
    
    // 期望的激活码
    const expectedCode = generateActivationCode(machineCode).replace(/-/g, '').replace(/^XY/, '')
    
    // 比较
    return cleanActivation === expectedCode
  } catch {
    return false
  }
}

/**
 * 将字符转换为数字 (0-35)
 */
function charCodeToNum(charCode: number): number {
  if (charCode >= 48 && charCode <= 57) {
    // '0'-'9' -> 0-9
    return charCode - 48
  } else if (charCode >= 65 && charCode <= 90) {
    // 'A'-'Z' -> 10-35
    return charCode - 65 + 10
  } else if (charCode >= 97 && charCode <= 122) {
    // 'a'-'z' -> 10-35
    return charCode - 97 + 10
  }
  return 0
}

/**
 * 将数字转换为字符
 */
function numToCharCode(num: number): string {
  if (num < 10) {
    // 0-9 -> '0'-'9'
    return String.fromCharCode(48 + num)
  } else {
    // 10-35 -> 'A'-'Z'
    return String.fromCharCode(65 + num - 10)
  }
}

/**
 * 计算简单校验和
 */
function calculateSimpleChecksum(str: string): number {
  let sum = 0
  for (let i = 0; i < str.length; i++) {
    sum += charCodeToNum(str.charCodeAt(i))
  }
  return sum % (36 * 36) // 最大 1295
}

/**
 * SHA-256 哈希
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 本地存储键名
 */
const LICENSE_STORAGE_KEY = 'xuyan_license_info'

/**
 * 许可证信息接口
 */
export interface LicenseInfo {
  machineCode: string
  activationCode: string
  activatedAt: number
  expiresAt: number | null
}

/**
 * 保存许可证信息到本地
 */
export function saveLicenseInfo(info: LicenseInfo): void {
  localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(info))
}

/**
 * 获取许可证信息
 */
export function getLicenseInfo(): LicenseInfo | null {
  const stored = localStorage.getItem(LICENSE_STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as LicenseInfo
  } catch {
    return null
  }
}

/**
 * 清除许可证信息
 */
export function clearLicenseInfo(): void {
  localStorage.removeItem(LICENSE_STORAGE_KEY)
}

/**
 * 检查软件是否已激活
 */
export async function isSoftwareActivated(): Promise<boolean> {
  const license = getLicenseInfo()
  if (!license) return false
  
  const currentMachineCode = await generateMachineCode()
  if (license.machineCode !== currentMachineCode) return false
  
  if (!verifyActivationCode(license.machineCode, license.activationCode)) {
    return false
  }
  
  if (license.expiresAt && Date.now() > license.expiresAt) {
    return false
  }
  
  return true
}

/**
 * 激活软件
 */
export async function activateSoftware(activationCode: string): Promise<{ success: boolean; message: string }> {
  const machineCode = await generateMachineCode()
  
  if (!verifyActivationCode(machineCode, activationCode)) {
    return { success: false, message: '激活码无效，请检查激活码是否正确' }
  }
  
  const licenseInfo: LicenseInfo = {
    machineCode,
    activationCode,
    activatedAt: Date.now(),
    expiresAt: null,
  }
  
  saveLicenseInfo(licenseInfo)
  return { success: true, message: '激活成功！感谢您的使用' }
}
