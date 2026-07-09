use crate::database;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeItem {
    #[serde(rename = "type")]
    pub change_type: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Changelog {
    pub id: u32,
    pub version: String,
    pub content: Vec<ChangeItem>,
    pub created_at: String,
    pub created_by: u32,
    pub creator_name: String,
}

#[derive(Debug, Serialize)]
pub struct ChangelogResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<Vec<Changelog>>,
}

#[derive(Debug, Serialize)]
pub struct AddChangelogResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<Changelog>,
}

pub async fn check_is_admin(user_id: u32) -> Result<bool, String> {
    let conn = database::connection()?;
    conn.query_row(
        "SELECT is_admin FROM users WHERE id=?1",
        params![user_id],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map(|value| value.unwrap_or(0) != 0)
    .map_err(|e| format!("查询用户权限失败: {e}"))
}

pub async fn get_changelogs() -> ChangelogResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return ChangelogResponse {
                success: false,
                message: e,
                data: None,
            }
        }
    };
    let mut statement = match conn.prepare(
        "SELECT c.id, c.version, c.content, c.created_at, c.created_by,
                COALESCE(u.nickname, '未知')
         FROM changelogs c LEFT JOIN users u ON c.created_by=u.id
         ORDER BY c.created_at DESC, c.id DESC",
    ) {
        Ok(value) => value,
        Err(e) => {
            return ChangelogResponse {
                success: false,
                message: format!("查询更新日志失败: {e}"),
                data: None,
            }
        }
    };
    let rows = statement.query_map([], |row| {
        let content: String = row.get(2)?;
        Ok(Changelog {
            id: row.get::<_, i64>(0)? as u32,
            version: row.get(1)?,
            content: serde_json::from_str(&content).unwrap_or_default(),
            created_at: row.get::<_, String>(3)?.chars().take(10).collect(),
            created_by: row.get::<_, i64>(4)? as u32,
            creator_name: row.get(5)?,
        })
    });
    match rows.and_then(Iterator::collect) {
        Ok(data) => ChangelogResponse {
            success: true,
            message: "获取成功".into(),
            data: Some(data),
        },
        Err(e) => ChangelogResponse {
            success: false,
            message: format!("查询更新日志失败: {e}"),
            data: None,
        },
    }
}

pub async fn add_changelog(
    user_id: u32,
    version: String,
    content: Vec<ChangeItem>,
) -> AddChangelogResponse {
    if !check_is_admin(user_id).await.unwrap_or(false) {
        return AddChangelogResponse {
            success: false,
            message: "权限不足，只有管理员可以添加更新日志".into(),
            data: None,
        };
    }
    if version.trim().is_empty() || content.is_empty() {
        return AddChangelogResponse {
            success: false,
            message: "版本号和更新内容不能为空".into(),
            data: None,
        };
    }
    let content_json = match serde_json::to_string(&content) {
        Ok(value) => value,
        Err(e) => {
            return AddChangelogResponse {
                success: false,
                message: format!("序列化内容失败: {e}"),
                data: None,
            }
        }
    };
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return AddChangelogResponse {
                success: false,
                message: e,
                data: None,
            }
        }
    };
    if let Err(e) = conn.execute(
        "INSERT INTO changelogs(version, content, created_by) VALUES (?1, ?2, ?3)",
        params![version.trim(), content_json, user_id],
    ) {
        return AddChangelogResponse {
            success: false,
            message: format!("添加失败: {e}"),
            data: None,
        };
    }
    let id = conn.last_insert_rowid() as u32;
    let creator_name = conn
        .query_row(
            "SELECT nickname FROM users WHERE id=?1",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "未知".into());
    AddChangelogResponse {
        success: true,
        message: "添加成功".into(),
        data: Some(Changelog {
            id,
            version,
            content,
            created_at: Utc::now().format("%Y-%m-%d").to_string(),
            created_by: user_id,
            creator_name,
        }),
    }
}

pub async fn delete_changelog(user_id: u32, changelog_id: u32) -> ChangelogResponse {
    if !check_is_admin(user_id).await.unwrap_or(false) {
        return ChangelogResponse {
            success: false,
            message: "权限不足，只有管理员可以删除更新日志".into(),
            data: None,
        };
    }
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return ChangelogResponse {
                success: false,
                message: e,
                data: None,
            }
        }
    };
    match conn.execute("DELETE FROM changelogs WHERE id=?1", params![changelog_id]) {
        Ok(_) => ChangelogResponse {
            success: true,
            message: "删除成功".into(),
            data: None,
        },
        Err(e) => ChangelogResponse {
            success: false,
            message: format!("删除失败: {e}"),
            data: None,
        },
    }
}

#[tauri::command]
pub async fn tauri_get_changelogs() -> ChangelogResponse {
    get_changelogs().await
}

#[tauri::command]
pub async fn tauri_add_changelog(
    user_id: u32,
    version: String,
    content: Vec<ChangeItem>,
) -> AddChangelogResponse {
    add_changelog(user_id, version, content).await
}

#[tauri::command]
pub async fn tauri_delete_changelog(user_id: u32, changelog_id: u32) -> ChangelogResponse {
    delete_changelog(user_id, changelog_id).await
}

#[tauri::command]
pub async fn tauri_check_is_admin(user_id: u32) -> Result<bool, String> {
    check_is_admin(user_id).await
}
