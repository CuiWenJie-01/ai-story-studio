use once_cell::sync::OnceCell;
use rusqlite::Connection;
use std::path::PathBuf;
use tauri::Manager;

static DATABASE_PATH: OnceCell<PathBuf> = OnceCell::new();

pub fn init(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let path = data_dir.join("xuyan.db");
    DATABASE_PATH
        .set(path.clone())
        .map_err(|_| "数据库路径已经初始化")?;

    let conn = open_at(&path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT NOT NULL,
            account TEXT NOT NULL UNIQUE COLLATE NOCASE,
            email TEXT NOT NULL DEFAULT '',
            password TEXT NOT NULL,
            company TEXT NOT NULL DEFAULT '',
            department TEXT NOT NULL DEFAULT '',
            remaining_days INTEGER NOT NULL DEFAULT 30,
            login_limit INTEGER NOT NULL DEFAULT 1,
            online_count INTEGER NOT NULL DEFAULT 0,
            last_deducted_date TEXT,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            instance_id TEXT NOT NULL,
            session_token TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, instance_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS changelogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER NOT NULL,
            is_admin_operation INTEGER NOT NULL DEFAULT 1
        );
        "#,
    )?;
    println!("[Database] 本地数据库: {}", path.display());
    Ok(())
}

fn open_at(path: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
    Ok(conn)
}

pub fn connection() -> Result<Connection, String> {
    let path = DATABASE_PATH
        .get()
        .ok_or_else(|| "本地数据库尚未初始化".to_string())?;
    open_at(path).map_err(|e| format!("打开本地数据库失败: {e}"))
}
