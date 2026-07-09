import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

async function getPackageVersion() {
  const packageJsonPath = join(rootDir, 'package.json')
  const content = await readFile(packageJsonPath, 'utf-8')
  const json = JSON.parse(content)
  return json.version
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
  
  const version = await getPackageVersion()
  await updateTauriConfig(version)
  
  console.log(`[update-version] 版本同步完成: ${version}`)
}

main().catch(console.error)
