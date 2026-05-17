import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const DB_CONFIG = {
  host: 'mysql6.sqlpub.com',
  port: 3311,
  user: 'xiaoxinna',
  password: 'hBeB6u5wHdh032GM',
  database: 'gujieuserdata'
}

async function getLatestVersionFromDb() {
  try {
    const mysql = await import('mysql2/promise')
    
    const connection = await mysql.createConnection(DB_CONFIG)
    
    const [rows] = await connection.execute(
      'SELECT version FROM changelogs ORDER BY created_at DESC LIMIT 1'
    )
    
    await connection.end()
    
    if (rows.length > 0 && rows[0].version) {
      let version = rows[0].version.replace(/^v/, '')
      // 确保版本号符合 semver 格式 (x.y.z)
      const parts = version.split('.')
      if (parts.length === 1) {
        version = `${version}.0.0`
      } else if (parts.length === 2) {
        version = `${version}.0`
      }
      return version
    }
    
    return null
  } catch (error) {
    console.log('[update-version] 无法从数据库获取版本号:', error.message)
    return null
  }
}

async function updatePackageJson(version) {
  const packageJsonPath = join(rootDir, 'package.json')
  const content = await readFile(packageJsonPath, 'utf-8')
  const json = JSON.parse(content)
  json.version = version
  await writeFile(packageJsonPath, JSON.stringify(json, null, 2))
  console.log(`[update-version] 更新 package.json 版本: ${version}`)
}

async function updateTauriConfig(version) {
  const tauriConfigPath = join(rootDir, 'src-tauri', 'tauri.conf.json')
  const content = await readFile(tauriConfigPath, 'utf-8')
  const json = JSON.parse(content)
  json.version = version
  await writeFile(tauriConfigPath, JSON.stringify(json, null, 2))
  console.log(`[update-version] 更新 tauri.conf.json 版本: ${version}`)
}

async function main() {
  console.log('[update-version] 开始更新版本号...')
  
  const latestVersion = await getLatestVersionFromDb()
  
  if (!latestVersion) {
    console.log('[update-version] 未找到更新日志，使用默认版本 1.4.0')
    return
  }

  await updatePackageJson(latestVersion)
  await updateTauriConfig(latestVersion)
  
  console.log(`[update-version] 版本更新完成: ${latestVersion}`)
}

main().catch(console.error)