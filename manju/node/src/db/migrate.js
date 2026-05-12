const fs = require('fs');
const path = require('path');
const { getDb } = require('./index.js');
const { loadConfig } = require('../config/index.js');

function stripLeadingComments(sql) {
  return sql
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('--');
    })
    .join('\n')
    .trim();
}

function runOne(database, sql, file, index) {
  const s = stripLeadingComments(sql);
  if (!s) return;
  try {
    // 兼容 better-sqlite3 和 sql.js
    if (database.exec) {
      database.exec(s);
    } else if (database.run) {
      database.run(s);
    } else {
      throw new Error('Database object does not have exec or run method');
    }
    console.log('Ran migration:', file + (index >= 0 ? ' #' + (index + 1) : ''));
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log('Skip (already exists):', file + (index >= 0 ? ' #' + (index + 1) : ''));
    } else if (msg.includes('no such table')) {
      console.warn('Skip migration (table not found, will be ensured later):', file, '-', err.message);
    } else {
      throw err;
    }
  }
}

function runMigrations(database) {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('Migrations dir missing, skipping:', migrationsDir);
    return;
  }
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (statements.length <= 1) {
      runOne(database, sql, file, -1);
    } else {
      statements.forEach((stmt, i) => runOne(database, stmt + ';', file, i));
    }
  }
}

function ensureColumns(database, table, columns) {
  let existing;
  try {
    // 兼容 better-sqlite3 和 sql.js
    let results;
    if (database.exec) {
      results = database.exec(`PRAGMA table_info(${table})`);
    } else if (database.run) {
      database.run(`PRAGMA table_info(${table})`);
      results = [];
    } else {
      throw new Error('Database object does not have exec or run method');
    }
    
    if (results && results.length > 0 && results[0].values) {
      existing = results[0].values.map(row => ({
        name: row[1],
        type: row[2],
        notNull: row[3] === 1,
        defaultValue: row[4],
        pk: row[5] === 1
      }));
    } else {
      console.log(`ensureColumns: table ${table} not found, skip`);
      return;
    }
  } catch (err) {
    if ((err.message || '').toLowerCase().includes('no such table')) {
      console.log(`ensureColumns: table ${table} not found, skip`);
      return;
    }
    throw err;
  }
  const names = new Set(existing.map((r) => r.name));
  for (const col of columns) {
    if (names.has(col.name)) continue;
    try {
      // 兼容 better-sqlite3 和 sql.js
      if (database.exec) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
      } else if (database.run) {
        database.run(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
      }
      console.log(`ensureColumns: added ${table}.${col.name} (${col.type})`);
    } catch (e) {
      if ((e.message || '').toLowerCase().includes('duplicate column')) {
        // already exists (race / concurrent)
      } else {
        console.warn(`ensureColumns: failed to add ${table}.${col.name}:`, e.message);
      }
    }
  }
}

function ensureAllColumns(database) {
  // --- dramas ---
  ensureColumns(database, 'dramas', [
    { name: 'title',          type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'description',    type: 'TEXT' },
    { name: 'genre',          type: 'TEXT' },
    { name: 'style',          type: 'TEXT DEFAULT \'realistic\'' },
    { name: 'tags',           type: 'TEXT' },
    { name: 'thumbnail',      type: 'TEXT' },
    { name: 'total_episodes', type: 'INTEGER DEFAULT 1' },
    { name: 'total_duration', type: 'INTEGER DEFAULT 0' },
    { name: 'status',         type: 'TEXT DEFAULT \'draft\'' },
    { name: 'metadata',       type: 'TEXT' },
    { name: 'created_at',     type: 'TEXT' },
    { name: 'updated_at',     type: 'TEXT' },
    { name: 'deleted_at',     type: 'TEXT' },
  ]);

  // --- episodes ---
  ensureColumns(database, 'episodes', [
    { name: 'drama_id',       type: 'INTEGER DEFAULT 0' },
    { name: 'episode_number', type: 'INTEGER DEFAULT 0' },
    { name: 'title',          type: 'TEXT DEFAULT \'\'' },
    { name: 'script_content', type: 'TEXT' },
    { name: 'description',    type: 'TEXT' },
    { name: 'duration',       type: 'INTEGER DEFAULT 0' },
    { name: 'video_url',      type: 'TEXT' },
    { name: 'thumbnail',      type: 'TEXT' },
    { name: 'status',         type: 'TEXT DEFAULT \'draft\'' },
    { name: 'created_at',     type: 'TEXT' },
    { name: 'updated_at',     type: 'TEXT' },
    { name: 'deleted_at',     type: 'TEXT' },
  ]);

  // --- storyboards ---
  ensureColumns(database, 'storyboards', [
    { name: 'episode_id',        type: 'INTEGER DEFAULT 0' },
    { name: 'scene_id',          type: 'INTEGER' },
    { name: 'storyboard_number', type: 'INTEGER DEFAULT 0' },
    { name: 'title',             type: 'TEXT' },
    { name: 'description',       type: 'TEXT' },
    { name: 'location',          type: 'TEXT' },
    { name: 'time',              type: 'TEXT' },
    { name: 'duration',          type: 'REAL' },
    { name: 'dialogue',          type: 'TEXT' },
    { name: 'narration',         type: 'TEXT' },
    { name: 'action',            type: 'TEXT' },
    { name: 'atmosphere',        type: 'TEXT' },
    { name: 'image_prompt',      type: 'TEXT' },
    { name: 'video_prompt',      type: 'TEXT' },
    { name: 'characters',        type: 'TEXT' },
    { name: 'shot_type',         type: 'TEXT' },
    { name: 'angle',             type: 'TEXT' },
    { name: 'movement',          type: 'TEXT' },
    { name: 'image_url',         type: 'TEXT' },
    { name: 'local_path',        type: 'TEXT' },
    { name: 'main_panel_idx',    type: 'INTEGER' },
    { name: 'video_url',         type: 'TEXT' },
    { name: 'composed_image',    type: 'TEXT' },
    { name: 'result',            type: 'TEXT' },
    { name: 'emotion',           type: 'TEXT' },
    { name: 'emotion_intensity', type: 'INTEGER' },
    { name: 'error_msg',         type: 'TEXT' },
    { name: 'segment_index',     type: 'INTEGER DEFAULT 0' },
    { name: 'segment_title',     type: 'TEXT' },
    { name: 'angle_h',           type: 'TEXT' },
    { name: 'angle_v',           type: 'TEXT' },
    { name: 'angle_s',           type: 'TEXT' },
    { name: 'lighting_style',    type: 'TEXT' },
    { name: 'depth_of_field',    type: 'TEXT' },
    { name: 'polished_prompt',        type: 'TEXT' },
    { name: 'continuity_snapshot',   type: 'TEXT' },
    { name: 'audio_local_path',      type: 'TEXT' },
    { name: 'narration_audio_local_path', type: 'TEXT' },
    { name: 'creation_mode',     type: 'TEXT DEFAULT \'classic\'' },
    { name: 'universal_segment_text', type: 'TEXT' },
    { name: 'status',            type: 'TEXT DEFAULT \'draft\'' },
    { name: 'created_at',        type: 'TEXT' },
    { name: 'updated_at',        type: 'TEXT' },
    { name: 'deleted_at',        type: 'TEXT' },
  ]);

  // --- characters ---
  ensureColumns(database, 'characters', [
    { name: 'drama_id',          type: 'INTEGER DEFAULT 0' },
    { name: 'name',              type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'role',              type: 'TEXT' },
    { name: 'description',       type: 'TEXT' },
    { name: 'personality',       type: 'TEXT' },
    { name: 'appearance',        type: 'TEXT' },
    { name: 'image_url',         type: 'TEXT' },
    { name: 'local_path',        type: 'TEXT' },
    { name: 'extra_images',      type: 'TEXT' },
    { name: 'voice_style',       type: 'TEXT' },
    { name: 'sort_order',        type: 'INTEGER DEFAULT 0' },
    { name: 'error_msg',         type: 'TEXT' },
    { name: 'identity_anchors',  type: 'TEXT' },
    { name: 'style_tokens',      type: 'TEXT' },
    { name: 'color_palette',     type: 'TEXT' },
    { name: 'four_view_image_url', type: 'TEXT' },
    { name: 'polished_prompt',   type: 'TEXT' },
    { name: 'ref_image',         type: 'TEXT' },
    { name: 'stages',            type: 'TEXT' },
    { name: 'seedance2_asset', type: 'TEXT' },
    { name: 'created_at',        type: 'TEXT' },
    { name: 'updated_at',        type: 'TEXT' },
    { name: 'deleted_at',        type: 'TEXT' },
  ]);

  // --- scenes ---
  ensureColumns(database, 'scenes', [
    { name: 'drama_id',         type: 'INTEGER DEFAULT 0' },
    { name: 'episode_id',       type: 'INTEGER' },
    { name: 'location',         type: 'TEXT' },
    { name: 'time',             type: 'TEXT' },
    { name: 'prompt',           type: 'TEXT' },
    { name: 'polished_prompt',  type: 'TEXT' },
    { name: 'image_url',        type: 'TEXT' },
    { name: 'local_path',       type: 'TEXT' },
    { name: 'extra_images',     type: 'TEXT' },
    { name: 'ref_image',        type: 'TEXT' },
    { name: 'storyboard_count', type: 'INTEGER DEFAULT 0' },
    { name: 'error_msg',        type: 'TEXT' },
    { name: 'status',           type: 'TEXT DEFAULT \'draft\'' },
    { name: 'created_at',       type: 'TEXT' },
    { name: 'updated_at',       type: 'TEXT' },
    { name: 'deleted_at',       type: 'TEXT' },
  ]);

  // --- props ---
  ensureColumns(database, 'props', [
    { name: 'drama_id',    type: 'INTEGER DEFAULT 0' },
    { name: 'episode_id',  type: 'INTEGER' },
    { name: 'name',        type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'type',        type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'prompt',      type: 'TEXT' },
    { name: 'image_url',    type: 'TEXT' },
    { name: 'local_path',   type: 'TEXT' },
    { name: 'extra_images', type: 'TEXT' },
    { name: 'ref_image',    type: 'TEXT' },
    { name: 'error_msg',    type: 'TEXT' },
    { name: 'created_at',   type: 'TEXT' },
    { name: 'updated_at',   type: 'TEXT' },
    { name: 'deleted_at',   type: 'TEXT' },
  ]);

  // --- ai_service_configs ---
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS ai_service_configs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      service_type  TEXT NOT NULL DEFAULT 'text',
      provider      TEXT DEFAULT '',
      name          TEXT DEFAULT '',
      base_url      TEXT DEFAULT '',
      api_key       TEXT,
      model         TEXT,
      default_model TEXT,
      endpoint      TEXT,
      query_endpoint TEXT,
      priority      INTEGER DEFAULT 0,
      is_default    INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      settings      TEXT,
      created_at    TEXT,
      updated_at    TEXT,
      deleted_at    TEXT
    )`);
  } catch (_) {}
  ensureColumns(database, 'ai_service_configs', [
    { name: 'service_type',   type: 'TEXT NOT NULL DEFAULT \'text\'' },
    { name: 'provider',       type: 'TEXT DEFAULT \'\'' },
    { name: 'name',           type: 'TEXT DEFAULT \'\'' },
    { name: 'base_url',       type: 'TEXT DEFAULT \'\'' },
    { name: 'api_key',        type: 'TEXT' },
    { name: 'model',          type: 'TEXT' },
    { name: 'default_model',  type: 'TEXT' },
    { name: 'endpoint',       type: 'TEXT' },
    { name: 'query_endpoint', type: 'TEXT' },
    { name: 'priority',       type: 'INTEGER DEFAULT 0' },
    { name: 'is_default',     type: 'INTEGER DEFAULT 0' },
    { name: 'is_active',      type: 'INTEGER DEFAULT 1' },
    { name: 'settings',       type: 'TEXT' },
    { name: 'created_at',     type: 'TEXT' },
    { name: 'updated_at',     type: 'TEXT' },
    { name: 'deleted_at',     type: 'TEXT' },
  ]);

  // --- async_tasks ---
  ensureColumns(database, 'async_tasks', [
    { name: 'type',         type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'status',       type: 'TEXT NOT NULL DEFAULT \'pending\'' },
    { name: 'progress',     type: 'INTEGER DEFAULT 0' },
    { name: 'message',      type: 'TEXT' },
    { name: 'resource_id',  type: 'TEXT' },
    { name: 'completed_at', type: 'TEXT' },
    { name: 'error',        type: 'TEXT' },
    { name: 'result',       type: 'TEXT' },
    { name: 'created_at',   type: 'TEXT' },
    { name: 'updated_at',   type: 'TEXT' },
    { name: 'deleted_at',   type: 'TEXT' },
  ]);

  // --- image_generations ---
  ensureColumns(database, 'image_generations', [
    { name: 'storyboard_id',    type: 'INTEGER' },
    { name: 'drama_id',         type: 'INTEGER' },
    { name: 'scene_id',         type: 'INTEGER' },
    { name: 'character_id',     type: 'INTEGER' },
    { name: 'provider',         type: 'TEXT' },
    { name: 'prompt',           type: 'TEXT' },
    { name: 'negative_prompt',  type: 'TEXT' },
    { name: 'model',            type: 'TEXT' },
    { name: 'frame_type',       type: 'TEXT' },
    { name: 'reference_images', type: 'TEXT' },
    { name: 'size',             type: 'TEXT' },
    { name: 'quality',          type: 'TEXT' },
    { name: 'image_url',        type: 'TEXT' },
    { name: 'local_path',       type: 'TEXT' },
    { name: 'status',           type: 'TEXT' },
    { name: 'task_id',          type: 'TEXT' },
    { name: 'completed_at',     type: 'TEXT' },
    { name: 'error_msg',        type: 'TEXT' },
    { name: 'created_at',       type: 'TEXT' },
    { name: 'updated_at',       type: 'TEXT' },
    { name: 'deleted_at',       type: 'TEXT' },
  ]);

  // --- video_generations ---
  ensureColumns(database, 'video_generations', [
    { name: 'drama_id',             type: 'INTEGER' },
    { name: 'storyboard_id',        type: 'INTEGER' },
    { name: 'provider',             type: 'TEXT' },
    { name: 'prompt',               type: 'TEXT' },
    { name: 'model',                type: 'TEXT' },
    { name: 'duration',             type: 'REAL' },
    { name: 'aspect_ratio',         type: 'TEXT' },
    { name: 'resolution',           type: 'TEXT' },
    { name: 'seed',                 type: 'INTEGER' },
    { name: 'camera_fixed',         type: 'INTEGER' },
    { name: 'watermark',            type: 'INTEGER' },
    { name: 'image_url',            type: 'TEXT' },
    { name: 'first_frame_url',      type: 'TEXT' },
    { name: 'last_frame_url',       type: 'TEXT' },
    { name: 'reference_image_urls', type: 'TEXT' },
    { name: 'video_url',            type: 'TEXT' },
    { name: 'local_path',           type: 'TEXT' },
    { name: 'status',               type: 'TEXT' },
    { name: 'task_id',              type: 'TEXT' },
    { name: 'scene_id',             type: 'INTEGER' },
    { name: 'completed_at',         type: 'TEXT' },
    { name: 'error_msg',            type: 'TEXT' },
    { name: 'created_at',           type: 'TEXT' },
    { name: 'updated_at',           type: 'TEXT' },
    { name: 'deleted_at',           type: 'TEXT' },
  ]);

  // --- video_merges ---
  ensureColumns(database, 'video_merges', [
    { name: 'episode_id',   type: 'INTEGER' },
    { name: 'drama_id',     type: 'INTEGER' },
    { name: 'title',        type: 'TEXT' },
    { name: 'provider',     type: 'TEXT' },
    { name: 'model',        type: 'TEXT' },
    { name: 'status',       type: 'TEXT' },
    { name: 'scenes',       type: 'TEXT' },
    { name: 'merge_options', type: 'TEXT' },
    { name: 'task_id',      type: 'TEXT' },
    { name: 'merged_url',   type: 'TEXT' },
    { name: 'duration',     type: 'INTEGER' },
    { name: 'completed_at', type: 'TEXT' },
    { name: 'error_msg',    type: 'TEXT' },
    { name: 'created_at',   type: 'TEXT' },
    { name: 'deleted_at',   type: 'TEXT' },
  ]);

  // --- assets ---
  ensureColumns(database, 'assets', [
    { name: 'drama_id',     type: 'INTEGER' },
    { name: 'name',         type: 'TEXT' },
    { name: 'type',         type: 'TEXT' },
    { name: 'category',     type: 'TEXT' },
    { name: 'url',          type: 'TEXT' },
    { name: 'local_path',   type: 'TEXT' },
    { name: 'file_size',    type: 'INTEGER' },
    { name: 'mime_type',    type: 'TEXT' },
    { name: 'width',        type: 'INTEGER' },
    { name: 'height',       type: 'INTEGER' },
    { name: 'duration',     type: 'REAL' },
    { name: 'image_gen_id', type: 'INTEGER' },
    { name: 'video_gen_id', type: 'INTEGER' },
    { name: 'created_at',   type: 'TEXT' },
    { name: 'updated_at',   type: 'TEXT' },
    { name: 'deleted_at',   type: 'TEXT' },
  ]);

  // --- character_libraries ---
  ensureColumns(database, 'character_libraries', [
    { name: 'drama_id',          type: 'INTEGER' },
    { name: 'name',              type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'category',          type: 'TEXT' },
    { name: 'image_url',         type: 'TEXT' },
    { name: 'local_path',        type: 'TEXT' },
    { name: 'description',       type: 'TEXT' },
    { name: 'appearance',        type: 'TEXT' },
    { name: 'tags',              type: 'TEXT' },
    { name: 'source_type',       type: 'TEXT' },
    { name: 'identity_anchors',  type: 'TEXT' },
    { name: 'style_tokens',      type: 'TEXT' },
    { name: 'color_palette',     type: 'TEXT' },
    { name: 'four_view_image_url', type: 'TEXT' },
    { name: 'created_at',        type: 'TEXT' },
    { name: 'updated_at',        type: 'TEXT' },
    { name: 'deleted_at',        type: 'TEXT' },
  ]);

  // --- scene_libraries ---
  ensureColumns(database, 'scene_libraries', [
    { name: 'drama_id',    type: 'INTEGER' },
    { name: 'location',    type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'time',        type: 'TEXT' },
    { name: 'prompt',      type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'image_url',   type: 'TEXT' },
    { name: 'local_path',  type: 'TEXT' },
    { name: 'category',    type: 'TEXT' },
    { name: 'tags',        type: 'TEXT' },
    { name: 'source_type', type: 'TEXT' },
    { name: 'created_at',  type: 'TEXT' },
    { name: 'updated_at',  type: 'TEXT' },
    { name: 'deleted_at',  type: 'TEXT' },
  ]);

  // --- prop_libraries ---
  ensureColumns(database, 'prop_libraries', [
    { name: 'drama_id',    type: 'INTEGER' },
    { name: 'name',        type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'description', type: 'TEXT' },
    { name: 'prompt',      type: 'TEXT' },
    { name: 'image_url',   type: 'TEXT' },
    { name: 'local_path',  type: 'TEXT' },
    { name: 'category',    type: 'TEXT' },
    { name: 'tags',        type: 'TEXT' },
    { name: 'source_type', type: 'TEXT' },
    { name: 'created_at',  type: 'TEXT' },
    { name: 'updated_at',  type: 'TEXT' },
    { name: 'deleted_at',  type: 'TEXT' },
  ]);

  // --- image_proxy_cache ---
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS image_proxy_cache (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key  TEXT NOT NULL UNIQUE,
      proxy_url  TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
  } catch (_) {}
  ensureColumns(database, 'image_proxy_cache', [
    { name: 'cache_key',  type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'proxy_url',  type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'created_at', type: 'TEXT NOT NULL DEFAULT \'\'' },
  ]);

  // --- ai_model_map ---
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS ai_model_map (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      key            TEXT NOT NULL UNIQUE,
      service_type   TEXT NOT NULL DEFAULT 'text',
      config_id      INTEGER,
      model_override TEXT,
      description    TEXT,
      created_at     TEXT NOT NULL DEFAULT '',
      updated_at     TEXT NOT NULL DEFAULT ''
    )`);
  } catch (_) {}
  ensureColumns(database, 'ai_model_map', [
    { name: 'key',            type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'service_type',   type: 'TEXT NOT NULL DEFAULT \'text\'' },
    { name: 'config_id',      type: 'INTEGER' },
    { name: 'model_override', type: 'TEXT' },
    { name: 'description',    type: 'TEXT' },
    { name: 'created_at',     type: 'TEXT NOT NULL DEFAULT \'\'' },
    { name: 'updated_at',     type: 'TEXT NOT NULL DEFAULT \'\'' },
  ]);

  // --- storyboard_characters ---
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS storyboard_characters (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      storyboard_id  INTEGER NOT NULL,
      character_id   INTEGER NOT NULL,
      created_at     TEXT NOT NULL DEFAULT ''
    )`);
  } catch (_) {}

  // --- global_settings ---
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS global_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    )`);
  } catch (_) {}
}

function runMigrationsAndEnsure(database) {
  runMigrations(database);
  ensureAllColumns(database);
}

async function main() {
  const config = loadConfig();
  const database = await getDb(config.database);
  runMigrationsAndEnsure(database);
  console.log('Migrations complete.');
}

if (require.main === module) {
  main();
}

module.exports = { runMigrationsAndEnsure, ensureColumns };