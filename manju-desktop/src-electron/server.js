import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import AdmZip from 'adm-zip'
import https from 'https'
import http from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 判断是否是内嵌模式（从 Tauri 启动）
const isEmbedded = process.env.MANJU_EMBEDDED === '1'

// 配置文件路径（用于存储用户设置的数据目录）
const SETTINGS_FILE = path.join(process.env.APPDATA || process.env.HOME || __dirname, 'manju-desktop-settings.json')

// 读取设置文件
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
    }
  } catch (e) {
    console.error('[Manju] 读取设置文件失败:', e.message)
  }
  return {}
}

// 保存设置文件
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Manju] 保存设置文件失败:', e.message)
  }
}

const settings = loadSettings()

// 数据目录：优先使用用户设置的数据目录，其次使用系统 AppData，最后使用项目目录
let DATA_DIR, UPLOAD_DIR, DB_PATH

if (settings.dataDir) {
  // 用户自定义数据目录
  DATA_DIR = path.join(settings.dataDir, 'manju-data')
  UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
  DB_PATH = path.join(DATA_DIR, 'manju.db')
} else if (isEmbedded && process.env.MANJU_DATA_DIR) {
  DATA_DIR = path.join(process.env.MANJU_DATA_DIR, 'manju-data')
  UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
  DB_PATH = path.join(DATA_DIR, 'manju.db')
} else {
  const ROOT = path.join(__dirname, '..')
  DATA_DIR = path.join(ROOT, 'data')
  UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
  DB_PATH = path.join(DATA_DIR, 'manju.db')
}

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

function initDatabase() {
  const migrationPath = path.join(__dirname, 'migrations', '01_init.sql')

  if (!fs.existsSync(migrationPath)) {
    console.error('[Manju] Migration file not found:', migrationPath)
    return
  }

  const sql = fs.readFileSync(migrationPath, 'utf-8')
  const statements = sql.split(';').filter(s => s.trim())
  for (const stmt of statements) {
    try { db.exec(stmt + ';') } catch (e) { /* ignore exists */ }
  }
}

initDatabase()

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use('/static', express.static(UPLOAD_DIR))

const upload = multer({ dest: UPLOAD_DIR })

function success(data) {
  return { success: true, data }
}

function error(message, code = 500) {
  return { success: false, error: { message, code } }
}

// ========== SETTINGS (Data Directory) ==========
app.get('/api/v1/settings', (req, res) => {
  res.json(success({
    data_dir: settings.dataDir || null,
    db_path: DB_PATH,
    upload_dir: UPLOAD_DIR
  }))
})

app.post('/api/v1/settings/data-dir', (req, res) => {
  const { data_dir } = req.body
  if (!data_dir || typeof data_dir !== 'string') {
    return res.status(400).json(error('请提供有效的数据目录路径'))
  }

  // 验证路径是否存在或可创建
  try {
    fs.mkdirSync(data_dir, { recursive: true })
    const testFile = path.join(data_dir, '.write-test')
    fs.writeFileSync(testFile, 'test', 'utf-8')
    fs.unlinkSync(testFile)
  } catch (e) {
    return res.status(400).json(error('无法访问该目录，请检查权限：' + e.message))
  }

  settings.dataDir = data_dir
  saveSettings(settings)

  res.json(success({
    message: '数据目录已设置，重启应用后生效',
    data_dir: data_dir,
    restart_required: true
  }))
})

// ========== DRAMAS ==========
app.get('/api/v1/dramas', (req, res) => {
  const page = parseInt(req.query.page) || 1
  const pageSize = parseInt(req.query.page_size) || 50
  const offset = (page - 1) * pageSize
  const stmt = db.prepare('SELECT * FROM dramas WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ? OFFSET ?')
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM dramas WHERE deleted_at IS NULL')
  const items = stmt.all(pageSize, offset)
  const { total } = countStmt.get()
  for (const item of items) {
    try { item.metadata = JSON.parse(item.metadata || '{}') } catch { item.metadata = {} }
    const eps = db.prepare('SELECT * FROM episodes WHERE drama_id = ? AND deleted_at IS NULL ORDER BY episode_number').all(item.id)
    item.episodes = eps || []
  }
  res.json(success({ items, pagination: { page, page_size: pageSize, total } }))
})

app.post('/api/v1/dramas', (req, res) => {
  const { title, description, metadata } = req.body
  const now = new Date().toISOString()
  const metaStr = metadata ? JSON.stringify(metadata) : '{}'
  const stmt = db.prepare('INSERT INTO dramas (title, description, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
  const result = stmt.run(title, description || '', 'draft', metaStr, now, now)
  res.json(success({ id: result.lastInsertRowid, title, description, status: 'draft', metadata, created_at: now, updated_at: now }))
})

app.get('/api/v1/dramas/:id', (req, res) => {
  const stmt = db.prepare('SELECT * FROM dramas WHERE id = ? AND deleted_at IS NULL')
  const drama = stmt.get(req.params.id)
  if (!drama) return res.status(404).json(error('项目不存在'))
  try { drama.metadata = JSON.parse(drama.metadata || '{}') } catch { drama.metadata = {} }
  const episodes = db.prepare('SELECT * FROM episodes WHERE drama_id = ? AND deleted_at IS NULL ORDER BY episode_number').all(drama.id)
  drama.episodes = episodes || []
  const characters = db.prepare('SELECT * FROM characters WHERE drama_id = ? AND deleted_at IS NULL ORDER BY sort_order').all(drama.id)
  drama.characters = characters || []
  const scenes = db.prepare('SELECT * FROM scenes WHERE drama_id = ? AND deleted_at IS NULL').all(drama.id)
  drama.scenes = scenes || []
  const props = db.prepare('SELECT * FROM props WHERE drama_id = ? AND deleted_at IS NULL').all(drama.id)
  drama.props = props || []
  res.json(success(drama))
})

app.put('/api/v1/dramas/:id', (req, res) => {
  const { title, description } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE dramas SET title = COALESCE(?, title), description = COALESCE(?, description), updated_at = ? WHERE id = ?')
  stmt.run(title, description, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/dramas/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE dramas SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.put('/api/v1/dramas/:id/episodes', (req, res) => {
  const { episodes } = req.body
  const dramaId = req.params.id
  const now = new Date().toISOString()
  db.prepare('DELETE FROM episodes WHERE drama_id = ?').run(dramaId)
  const insert = db.prepare('INSERT INTO episodes (drama_id, episode_number, title, script_content, description, duration, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (const ep of episodes || []) {
    insert.run(dramaId, ep.episode_number || 0, ep.title || '', ep.script_content || '', ep.description || null, ep.duration || 0, ep.status || 'draft', now, now)
  }
  db.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(now, dramaId)
  res.json(success({ episodes }))
})

app.put('/api/v1/dramas/:id/outline', (req, res) => {
  const { genre, style, metadata } = req.body
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT metadata FROM dramas WHERE id = ?').get(req.params.id)
  let meta = {}
  try { meta = JSON.parse(existing?.metadata || '{}') } catch {}
  if (metadata) Object.assign(meta, metadata)
  const stmt = db.prepare('UPDATE dramas SET genre = COALESCE(?, genre), style = COALESCE(?, style), metadata = ?, updated_at = ? WHERE id = ?')
  stmt.run(genre, style, JSON.stringify(meta), now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.get('/api/v1/dramas/:id/export', (req, res) => {
  const drama = db.prepare('SELECT * FROM dramas WHERE id = ?').get(req.params.id)
  if (!drama) return res.status(404).json(error('项目不存在'))
  const episodes = db.prepare('SELECT * FROM episodes WHERE drama_id = ?').all(drama.id)
  const characters = db.prepare('SELECT * FROM characters WHERE drama_id = ?').all(drama.id)
  const scenes = db.prepare('SELECT * FROM scenes WHERE drama_id = ?').all(drama.id)
  const props = db.prepare('SELECT * FROM props WHERE drama_id = ?').all(drama.id)
  const exportData = { drama, episodes, characters, scenes, props, version: '1.0' }
  const zip = new AdmZip()
  zip.addFile('data.json', Buffer.from(JSON.stringify(exportData, null, 2)))
  const buf = zip.toBuffer()
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${drama.title || 'drama'}.zip"`)
  res.send(buf)
})

app.post('/api/v1/dramas/import', upload.single('file'), (req, res) => {
  try {
    const zip = new AdmZip(req.file.path)
    const entry = zip.getEntry('data.json')
    if (!entry) return res.status(400).json(error('无效的导入文件'))
    const data = JSON.parse(zip.readAsText(entry))
    const now = new Date().toISOString()
    const drama = data.drama
    const dramaStmt = db.prepare('INSERT INTO dramas (title, description, genre, style, metadata, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const dramaResult = dramaStmt.run(drama.title, drama.description || '', drama.genre || null, drama.style || null, drama.metadata || '{}', 'draft', now, now)
    const newDramaId = dramaResult.lastInsertRowid
    const epStmt = db.prepare('INSERT INTO episodes (drama_id, episode_number, title, script_content, description, duration, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const ep of data.episodes || []) {
      epStmt.run(newDramaId, ep.episode_number || 0, ep.title || '', ep.script_content || '', ep.description || null, ep.duration || 0, ep.status || 'draft', now, now)
    }
    fs.unlinkSync(req.file.path)
    res.json(success({ id: newDramaId, title: drama.title }))
  } catch (e) {
    res.status(500).json(error(e.message))
  }
})

app.get('/api/v1/dramas/examples', (req, res) => {
  res.json(success([]))
})

app.post('/api/v1/dramas/import-example', (req, res) => {
  res.status(404).json(error('示例功能暂不可用'))
})

// ========== EPISODES ==========
app.get('/api/v1/episodes/:id/storyboards', (req, res) => {
  const storyboards = db.prepare('SELECT * FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL ORDER BY storyboard_number').all(req.params.id)
  res.json(success(storyboards))
})

app.post('/api/v1/episodes/:id/storyboards', (req, res) => {
  const { model, style, prompt } = req.body
  const episodeId = req.params.id
  const now = new Date().toISOString()
  const count = db.prepare('SELECT COUNT(*) as c FROM storyboards WHERE episode_id = ?').get(episodeId).c
  const stmt = db.prepare('INSERT INTO storyboards (episode_id, storyboard_number, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const result = stmt.run(episodeId, count + 1, '新分镜', prompt || '', 'draft', now, now)
  res.json(success({ id: result.lastInsertRowid }))
})

app.post('/api/v1/episodes/:id/finalize', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?').run('completed', now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

// ========== STORYBOARDS ==========
app.put('/api/v1/storyboards/:id', (req, res) => {
  const { title, description, image_prompt, video_prompt, duration, status } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE storyboards SET title = COALESCE(?, title), description = COALESCE(?, description), image_prompt = COALESCE(?, image_prompt), video_prompt = COALESCE(?, video_prompt), duration = COALESCE(?, duration), status = COALESCE(?, status), updated_at = ? WHERE id = ?')
  stmt.run(title, description, image_prompt, video_prompt, duration, status, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/storyboards/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE storyboards SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.post('/api/v1/storyboards/:id/generate-image', (req, res) => {
  const taskId = uuidv4()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO async_tasks (id, type, status, resource_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(taskId, 'image', 'pending', req.params.id, now, now)
  res.json(success({ task_id: taskId }))
})

app.post('/api/v1/storyboards/:id/generate-video', (req, res) => {
  const taskId = uuidv4()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO async_tasks (id, type, status, resource_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(taskId, 'video', 'pending', req.params.id, now, now)
  res.json(success({ task_id: taskId }))
})

// ========== CHARACTERS ==========
app.get('/api/v1/characters', (req, res) => {
  const { drama_id } = req.query
  let sql = 'SELECT * FROM characters WHERE deleted_at IS NULL'
  const params = []
  if (drama_id) { sql += ' AND drama_id = ?'; params.push(drama_id) }
  sql += ' ORDER BY sort_order'
  const items = db.prepare(sql).all(...params)
  res.json(success(items))
})

app.post('/api/v1/characters', (req, res) => {
  const { drama_id, name, role, description, personality, appearance } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('INSERT INTO characters (drama_id, name, role, description, personality, appearance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const result = stmt.run(drama_id, name, role || null, description || null, personality || null, appearance || null, now, now)
  res.json(success({ id: result.lastInsertRowid }))
})

app.put('/api/v1/characters/:id', (req, res) => {
  const { name, role, description, personality, appearance, image_url, local_path } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE characters SET name = COALESCE(?, name), role = COALESCE(?, role), description = COALESCE(?, description), personality = COALESCE(?, personality), appearance = COALESCE(?, appearance), image_url = COALESCE(?, image_url), local_path = COALESCE(?, local_path), updated_at = ? WHERE id = ?')
  stmt.run(name, role, description, personality, appearance, image_url, local_path, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/characters/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE characters SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

// ========== SCENES ==========
app.get('/api/v1/scenes', (req, res) => {
  const { drama_id } = req.query
  let sql = 'SELECT * FROM scenes WHERE deleted_at IS NULL'
  const params = []
  if (drama_id) { sql += ' AND drama_id = ?'; params.push(drama_id) }
  const items = db.prepare(sql).all(...params)
  res.json(success(items))
})

app.post('/api/v1/scenes', (req, res) => {
  const { drama_id, location, time, description, prompt } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('INSERT INTO scenes (drama_id, location, time, description, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const result = stmt.run(drama_id, location || '', time || null, description || null, prompt || null, now, now)
  res.json(success({ id: result.lastInsertRowid }))
})

app.put('/api/v1/scenes/:id', (req, res) => {
  const { location, time, description, prompt, image_url, local_path } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE scenes SET location = COALESCE(?, location), time = COALESCE(?, time), description = COALESCE(?, description), prompt = COALESCE(?, prompt), image_url = COALESCE(?, image_url), local_path = COALESCE(?, local_path), updated_at = ? WHERE id = ?')
  stmt.run(location, time, description, prompt, image_url, local_path, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/scenes/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE scenes SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

// ========== PROPS ==========
app.get('/api/v1/props', (req, res) => {
  const { drama_id } = req.query
  let sql = 'SELECT * FROM props WHERE deleted_at IS NULL'
  const params = []
  if (drama_id) { sql += ' AND drama_id = ?'; params.push(drama_id) }
  const items = db.prepare(sql).all(...params)
  res.json(success(items))
})

app.post('/api/v1/props', (req, res) => {
  const { drama_id, name, type, description, prompt } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('INSERT INTO props (drama_id, name, type, description, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const result = stmt.run(drama_id, name, type || null, description || null, prompt || null, now, now)
  res.json(success({ id: result.lastInsertRowid }))
})

app.put('/api/v1/props/:id', (req, res) => {
  const { name, type, description, prompt, image_url, local_path } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE props SET name = COALESCE(?, name), type = COALESCE(?, type), description = COALESCE(?, description), prompt = COALESCE(?, prompt), image_url = COALESCE(?, image_url), local_path = COALESCE(?, local_path), updated_at = ? WHERE id = ?')
  stmt.run(name, type, description, prompt, image_url, local_path, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/props/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE props SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

// ========== IMAGES ==========
app.post('/api/v1/images', (req, res) => {
  const taskId = uuidv4()
  const now = new Date().toISOString()
  const { prompt, drama_id } = req.body
  db.prepare('INSERT INTO async_tasks (id, type, status, message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(taskId, 'image', 'pending', prompt, now, now)
  res.json(success({ task_id: taskId }))
})

app.get('/api/v1/images', (req, res) => {
  const items = db.prepare('SELECT * FROM image_generations WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50').all()
  res.json(success(items))
})

// ========== VIDEOS ==========
app.post('/api/v1/videos', (req, res) => {
  const taskId = uuidv4()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO async_tasks (id, type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(taskId, 'video', 'pending', now, now)
  res.json(success({ task_id: taskId }))
})

app.get('/api/v1/videos', (req, res) => {
  const items = db.prepare('SELECT * FROM video_generations WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50').all()
  res.json(success(items))
})

// ========== TASKS ==========
app.get('/api/v1/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM async_tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json(error('任务不存在'))
  try { task.result = JSON.parse(task.result || '{}') } catch { task.result = {} }
  res.json(success(task))
})

app.get('/api/v1/tasks', (req, res) => {
  const items = db.prepare('SELECT * FROM async_tasks WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100').all()
  res.json(success(items))
})

// ========== AI CONFIG (Full Version) ==========

// Helper: postJSON for connection testing
function postJSON(url, headers, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const bodyStr = JSON.stringify(body)
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    }
    const req = mod.request(options, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        resolve({ status: res.statusCode, raw })
      })
      res.on('error', reject)
    })
    const timer = setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, timeoutMs)
    req.on('error', (e) => { clearTimeout(timer); reject(e); })
    req.write(bodyStr)
    req.end()
  })
}

app.get('/api/v1/ai-config', (req, res) => {
  const configs = db.prepare('SELECT * FROM ai_service_configs WHERE deleted_at IS NULL ORDER BY priority DESC, id ASC').all()
  for (const c of configs) {
    try {
      if (c.model && typeof c.model === 'string') {
        c.model = JSON.parse(c.model)
      }
    } catch { c.model = c.model ? [c.model] : [] }
    if (!Array.isArray(c.model)) c.model = c.model ? [c.model] : []
  }
  res.json(success(configs))
})

app.post('/api/v1/ai-config', (req, res) => {
  const { service_type, provider, name, base_url, api_key, model, default_model, api_protocol, endpoint, query_endpoint, priority, is_default, settings: cfgSettings } = req.body
  const now = new Date().toISOString()
  const modelStr = Array.isArray(model) ? JSON.stringify(model) : (model || '')
  const result = db.prepare('INSERT INTO ai_service_configs (service_type, provider, name, base_url, api_key, model, default_model, api_protocol, endpoint, query_endpoint, priority, is_default, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(service_type, provider || '', name || '', base_url || '', api_key || '', modelStr, default_model || '', api_protocol || '', endpoint || '', query_endpoint || '', priority || 0, is_default ? 1 : 0, cfgSettings || '', now, now)
  res.json(success({ id: result.lastInsertRowid }))
})

app.put('/api/v1/ai-config/:id', (req, res) => {
  const { service_type, provider, name, base_url, api_key, model, default_model, api_protocol, endpoint, query_endpoint, priority, is_default, settings: cfgSettings } = req.body
  const now = new Date().toISOString()
  const modelStr = Array.isArray(model) ? JSON.stringify(model) : (model || '')
  db.prepare('UPDATE ai_service_configs SET service_type = COALESCE(?, service_type), provider = COALESCE(?, provider), name = COALESCE(?, name), base_url = COALESCE(?, base_url), api_key = COALESCE(?, api_key), model = COALESCE(?, model), default_model = COALESCE(?, default_model), api_protocol = COALESCE(?, api_protocol), endpoint = COALESCE(?, endpoint), query_endpoint = COALESCE(?, query_endpoint), priority = COALESCE(?, priority), is_default = COALESCE(?, is_default), settings = COALESCE(?, settings), updated_at = ? WHERE id = ?')
    .run(service_type, provider, name, base_url, api_key, modelStr, default_model, api_protocol, endpoint, query_endpoint, priority, is_default != null ? (is_default ? 1 : 0) : undefined, cfgSettings, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/ai-config/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE ai_service_configs SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.post('/api/v1/ai-config/bulk-update-key', (req, res) => {
  const { api_key } = req.body
  const now = new Date().toISOString()
  db.prepare('UPDATE ai_service_configs SET api_key = ?, updated_at = ? WHERE deleted_at IS NULL').run(api_key || '', now)
  res.json(success({ message: '所有配置的 API Key 已更新' }))
})

app.get('/api/v1/ai-config/vendor-lock', (req, res) => {
  res.json(success({ enabled: false }))
})

app.post('/api/v1/ai-config/test', async (req, res) => {
  const { base_url, api_key, model, provider, endpoint, service_type } = req.body
  try {
    if (!base_url || !api_key) {
      return res.status(400).json(error('请填写 Base URL 和 API Key'))
    }
    const base = base_url.replace(/\/$/, '')
    let testUrl = base + (endpoint || '/chat/completions')
    let body = { model: model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }

    if (service_type === 'image' || service_type === 'storyboard_image') {
      testUrl = base + (endpoint || '/images/generations')
      body = { model: model || 'dall-e-3', prompt: 'test', n: 1, size: '1024x1024' }
    } else if (service_type === 'video') {
      testUrl = base + (endpoint || '/v1/video/create')
      body = { model: model || 'kling-video', prompt: 'test' }
    }

    const result = await postJSON(testUrl, { Authorization: 'Bearer ' + api_key }, body, 15000)
    if (result.status >= 200 && result.status < 300) {
      return res.json(success({ success: true, message: '连接测试通过' }))
    } else {
      return res.status(400).json(error('连接测试失败：HTTP ' + result.status))
    }
  } catch (e) {
    return res.status(400).json(error('连接测试失败：' + e.message))
  }
})

app.post('/api/v1/ai-config/jimeng2-assets', async (req, res) => {
  const { base_url, api_key, limit, cursor } = req.body
  try {
    const base = (base_url || '').replace(/\/$/, '')
    const url = `${base}/api/business/v1/assets?limit=${limit || 20}${cursor ? '&cursor=' + cursor : ''}`
    const result = await postJSON(url, { Authorization: 'Bearer ' + (api_key || '') }, {}, 15000)
    if (result.status >= 200 && result.status < 300) {
      const data = JSON.parse(result.raw || '{}')
      return res.json(success(data))
    }
    return res.status(400).json(error('获取素材列表失败'))
  } catch (e) {
    return res.status(400).json(error('获取素材列表失败：' + e.message))
  }
})

// ========== GENERATION SETTINGS ==========
app.get('/api/v1/generation-settings', (req, res) => {
  const row = db.prepare('SELECT * FROM settings WHERE key = ?').get('generation')
  let data = { concurrency: 3, video_concurrency: 3 }
  if (row?.value) {
    try { data = JSON.parse(row.value) } catch {}
  }
  res.json(success(data))
})

app.post('/api/v1/generation-settings', (req, res) => {
  const { concurrency, video_concurrency } = req.body
  const value = JSON.stringify({ concurrency: concurrency || 3, video_concurrency: video_concurrency || 3 })
  const existing = db.prepare('SELECT id FROM settings WHERE key = ?').get('generation')
  if (existing) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, 'generation')
  } else {
    db.prepare('INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('generation', value, new Date().toISOString(), new Date().toISOString())
  }
  res.json(success({ message: '已保存' }))
})

// ========== PROMPT OVERRIDES ==========
app.get('/api/v1/prompt-overrides', (req, res) => {
  const items = db.prepare('SELECT * FROM prompt_overrides WHERE deleted_at IS NULL').all()
  res.json(success(items))
})

app.post('/api/v1/prompt-overrides', (req, res) => {
  const { key, content } = req.body
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id FROM prompt_overrides WHERE key = ? AND deleted_at IS NULL').get(key)
  if (existing) {
    db.prepare('UPDATE prompt_overrides SET content = ?, updated_at = ? WHERE id = ?').run(content || '', now, existing.id)
    res.json(success({ id: existing.id }))
  } else {
    const result = db.prepare('INSERT INTO prompt_overrides (key, content, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(key, content || '', now, now)
    res.json(success({ id: result.lastInsertRowid }))
  }
})

app.delete('/api/v1/prompt-overrides/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE prompt_overrides SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

// ========== SCENE MODEL MAP ==========
app.get('/api/v1/scene-model-map', (req, res) => {
  const items = db.prepare('SELECT * FROM ai_model_map WHERE deleted_at IS NULL').all()
  res.json(success(items))
})

app.post('/api/v1/scene-model-map', (req, res) => {
  const { key, service_type, config_id, model_override } = req.body
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id FROM ai_model_map WHERE key = ? AND deleted_at IS NULL').get(key)
  if (existing) {
    db.prepare('UPDATE ai_model_map SET service_type = ?, config_id = ?, model_override = ?, updated_at = ? WHERE id = ?')
      .run(service_type || 'text', config_id || null, model_override || null, now, existing.id)
    res.json(success({ id: existing.id }))
  } else {
    const result = db.prepare('INSERT INTO ai_model_map (key, service_type, config_id, model_override, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(key, service_type || 'text', config_id || null, model_override || null, now, now)
    res.json(success({ id: result.lastInsertRowid }))
  }
})

app.delete('/api/v1/scene-model-map/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE ai_model_map SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

// ========== UPLOAD ==========
app.post('/api/v1/upload/image', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json(error('未上传文件'))
  const ext = path.extname(req.file.originalname) || '.jpg'
  const filename = `${uuidv4()}${ext}`
  const dest = path.join(UPLOAD_DIR, filename)
  fs.renameSync(req.file.path, dest)
  res.json(success({ url: `/static/${filename}`, local_path: filename }))
})

app.post('/api/v1/upload/video', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json(error('未上传文件'))
  const ext = path.extname(req.file.originalname) || '.mp4'
  const filename = `${uuidv4()}${ext}`
  const dest = path.join(UPLOAD_DIR, filename)
  fs.renameSync(req.file.path, dest)
  res.json(success({ url: `/static/${filename}`, local_path: filename }))
})

// ========== CHARACTER LIBRARY ==========
app.get('/api/v1/character-library', (req, res) => {
  const page = parseInt(req.query.page) || 1
  const pageSize = parseInt(req.query.page_size) || 20
  const offset = (page - 1) * pageSize
  const keyword = req.query.keyword
  const drama_id = req.query.drama_id
  let sql = 'SELECT * FROM character_libraries WHERE deleted_at IS NULL'
  const params = []
  if (drama_id) { sql += ' AND (drama_id = ? OR drama_id IS NULL)'; params.push(drama_id) }
  if (keyword) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`) }
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total')
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(pageSize, offset)
  const items = db.prepare(sql).all(...params)
  const { total } = db.prepare(countSql).get(...params.slice(0, -2))
  res.json(success({ items, pagination: { page, page_size: pageSize, total } }))
})

app.post('/api/v1/character-library', (req, res) => {
  const { name, category, description, tags, image_url, local_path, drama_id, source_type } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('INSERT INTO character_libraries (name, category, description, tags, image_url, local_path, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const result = stmt.run(name, category || null, description || null, tags || null, image_url || null, local_path || null, source_type || 'custom', now, now)
  res.json(success({ id: result.lastInsertRowid }))
})

app.put('/api/v1/character-library/:id', (req, res) => {
  const { name, category, description, tags, image_url, local_path } = req.body
  const now = new Date().toISOString()
  db.prepare('UPDATE character_libraries SET name = COALESCE(?, name), category = COALESCE(?, category), description = COALESCE(?, description), tags = COALESCE(?, tags), image_url = COALESCE(?, image_url), local_path = COALESCE(?, local_path), updated_at = ? WHERE id = ?')
    .run(name, category, description, tags, image_url, local_path, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/character-library/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE character_libraries SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

// ========== SCENE LIBRARY ==========
app.get('/api/v1/scene-library', (req, res) => {
  const page = parseInt(req.query.page) || 1
  const pageSize = parseInt(req.query.page_size) || 20
  const offset = (page - 1) * pageSize
  const keyword = req.query.keyword
  let sql = 'SELECT * FROM scene_libraries WHERE deleted_at IS NULL'
  const params = []
  if (keyword) { sql += ' AND (location LIKE ? OR description LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`) }
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total')
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(pageSize, offset)
  const items = db.prepare(sql).all(...params)
  const { total } = db.prepare(countSql).get(...params.slice(0, -2))
  res.json(success({ items, pagination: { page, page_size: pageSize, total } }))
})

app.post('/api/v1/scene-library', (req, res) => {
  const { location, time, description, prompt, image_url, local_path, category, tags, source_type } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('INSERT INTO scene_libraries (location, time, description, prompt, image_url, local_path, category, tags, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const result = stmt.run(location || '', time || null, description || null, prompt || null, image_url || null, local_path || null, category || null, tags || null, source_type || 'custom', now, now)
  res.json(success({ id: result.lastInsertRowid }))
})

app.put('/api/v1/scene-library/:id', (req, res) => {
  const { location, time, description, prompt, image_url, local_path, category, tags } = req.body
  const now = new Date().toISOString()
  db.prepare('UPDATE scene_libraries SET location = COALESCE(?, location), time = COALESCE(?, time), description = COALESCE(?, description), prompt = COALESCE(?, prompt), image_url = COALESCE(?, image_url), local_path = COALESCE(?, local_path), category = COALESCE(?, category), tags = COALESCE(?, tags), updated_at = ? WHERE id = ?')
    .run(location, time, description, prompt, image_url, local_path, category, tags, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/scene-library/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE scene_libraries SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

// ========== PROP LIBRARY ==========
app.get('/api/v1/prop-library', (req, res) => {
  const page = parseInt(req.query.page) || 1
  const pageSize = parseInt(req.query.page_size) || 20
  const offset = (page - 1) * pageSize
  const keyword = req.query.keyword
  let sql = 'SELECT * FROM prop_libraries WHERE deleted_at IS NULL'
  const params = []
  if (keyword) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`) }
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total')
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(pageSize, offset)
  const items = db.prepare(sql).all(...params)
  const { total } = db.prepare(countSql).get(...params.slice(0, -2))
  res.json(success({ items, pagination: { page, page_size: pageSize, total } }))
})

app.post('/api/v1/prop-library', (req, res) => {
  const { name, description, prompt, image_url, local_path, category, tags, source_type } = req.body
  const now = new Date().toISOString()
  const stmt = db.prepare('INSERT INTO prop_libraries (name, description, prompt, image_url, local_path, category, tags, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const result = stmt.run(name, description || null, prompt || null, image_url || null, local_path || null, category || null, tags || null, source_type || 'custom', now, now)
  res.json(success({ id: result.lastInsertRowid }))
})

app.put('/api/v1/prop-library/:id', (req, res) => {
  const { name, description, prompt, image_url, local_path, category, tags } = req.body
  const now = new Date().toISOString()
  db.prepare('UPDATE prop_libraries SET name = COALESCE(?, name), description = COALESCE(?, description), prompt = COALESCE(?, prompt), image_url = COALESCE(?, image_url), local_path = COALESCE(?, local_path), category = COALESCE(?, category), tags = COALESCE(?, tags), updated_at = ? WHERE id = ?')
    .run(name, description, prompt, image_url, local_path, category, tags, now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

app.delete('/api/v1/prop-library/:id', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE prop_libraries SET deleted_at = ? WHERE id = ?').run(now, req.params.id)
  res.json(success({ id: parseInt(req.params.id) }))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`[Manju] Server running on port ${PORT}`)
  console.log(`[Manju] Database: ${DB_PATH}`)
  console.log(`[Manju] Uploads: ${UPLOAD_DIR}`)
  console.log(`[Manju] Mode: ${isEmbedded ? 'embedded' : 'standalone'}`)
})
