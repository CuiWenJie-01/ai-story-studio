use serde::{Deserialize, Serialize};
use mysql::*;
use mysql::prelude::*;
use chrono::{NaiveDateTime, Utc};

const DB_HOST: &str = "mysql6.sqlpub.com";
const DB_PORT: u16 = 3311;
const DB_NAME: &str = "gujieuserdata";
const DB_USER: &str = "xiaoxinna";
const DB_PASS: &str = "hBeB6u5wHdh032GM";

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

#[derive(Debug, Deserialize)]
pub struct AddChangelogRequest {
    pub user_id: u32,
    pub version: String,
    pub content: Vec<ChangeItem>,
}

fn get_conn() -> Result<PooledConn, String> {
    let opts = OptsBuilder::new()
        .ip_or_hostname(Some(DB_HOST))
        .tcp_port(DB_PORT)
        .db_name(Some(DB_NAME))
        .user(Some(DB_USER))
        .pass(Some(DB_PASS));
    let pool = Pool::new(opts)
        .map_err(|e| format!("数据库连接失败: {}", e))?;
    pool.get_conn()
        .map_err(|e| format!("获取连接失败: {}", e))
}

pub async fn check_is_admin(user_id: u32) -> Result<bool, String> {
    let mut conn = get_conn()?;
    
    let is_admin: Option<bool> = conn
        .exec_first(
            "SELECT is_admin FROM users WHERE id = ?",
            (&user_id,)
        )
        .map_err(|e| format!("查询用户权限失败: {}", e))?;
    
    Ok(is_admin.unwrap_or(false))
}

pub async fn get_changelogs() -> ChangelogResponse {
    println!("[Changelog] 获取更新日志列表");
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            return ChangelogResponse {
                success: false,
                message: e,
                data: None,
            };
        }
    };
    
    let result = match conn.query_map(
        "SELECT c.id, c.version, c.content, c.created_at, c.created_by, u.nickname 
         FROM changelogs c 
         LEFT JOIN users u ON c.created_by = u.id 
         ORDER BY c.created_at DESC",
        |(id, version, content, created_at, created_by, creator_name): (u32, String, String, NaiveDateTime, u32, String)| {
            (id, version, content, created_at, created_by, creator_name)
        }
    ) {
        Ok(r) => r,
        Err(e) => {
            return ChangelogResponse {
                success: false,
                message: format!("查询更新日志失败: {}", e),
                data: None,
            };
        }
    };
    
    let changelogs: Vec<Changelog> = result
        .into_iter()
        .map(|(id, version, content, created_at, created_by, creator_name)| {
            let content_items: Vec<ChangeItem> = serde_json::from_str(&content)
                .unwrap_or_else(|_| vec![]);
            
            Changelog {
                id,
                version,
                content: content_items,
                created_at: created_at.format("%Y-%m-%d").to_string(),
                created_by,
                creator_name,
            }
        })
        .collect();
    
    println!("[Changelog] 获取到 {} 条更新日志", changelogs.len());
    
    ChangelogResponse {
        success: true,
        message: "获取成功".to_string(),
        data: Some(changelogs),
    }
}

pub async fn add_changelog(
    user_id: u32,
    version: String,
    content: Vec<ChangeItem>,
) -> AddChangelogResponse {
    println!("[Changelog] 添加更新日志: user_id={}, version={}", user_id, version);
    
    match check_is_admin(user_id).await {
        Ok(true) => {},
        Ok(false) => {
            return AddChangelogResponse {
                success: false,
                message: "权限不足，只有管理员可以添加更新日志".to_string(),
                data: None,
            };
        },
        Err(e) => {
            return AddChangelogResponse {
                success: false,
                message: e,
                data: None,
            };
        }
    }
    
    if version.is_empty() {
        return AddChangelogResponse {
            success: false,
            message: "版本号不能为空".to_string(),
            data: None,
        };
    }
    
    if content.is_empty() {
        return AddChangelogResponse {
            success: false,
            message: "更新内容不能为空".to_string(),
            data: None,
        };
    }
    
    let content_json = match serde_json::to_string(&content) {
        Ok(j) => j,
        Err(e) => {
            return AddChangelogResponse {
                success: false,
                message: format!("序列化内容失败: {}", e),
                data: None,
            };
        }
    };
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            return AddChangelogResponse {
                success: false,
                message: e,
                data: None,
            };
        }
    };
    
    let insert_result = conn.exec_drop(
        "INSERT INTO changelogs (version, content, created_by, is_admin_operation) VALUES (?, ?, ?, TRUE)",
        (&version, &content_json, &user_id)
    );
    
    match insert_result {
        Ok(_) => {
            let id: Option<u32> = conn
                .exec_first("SELECT LAST_INSERT_ID()", ())
                .ok()
                .flatten();
            
            let creator_name: String = conn
                .exec_first(
                    "SELECT nickname FROM users WHERE id = ?",
                    (&user_id,)
                )
                .ok()
                .flatten()
                .unwrap_or_else(|| "未知".to_string());
            
            println!("[Changelog] 添加成功: id={}", id.unwrap_or(0));
            
            AddChangelogResponse {
                success: true,
                message: "添加成功".to_string(),
                data: Some(Changelog {
                    id: id.unwrap_or(0),
                    version,
                    content,
                    created_at: Utc::now().format("%Y-%m-%d").to_string(),
                    created_by: user_id,
                    creator_name,
                }),
            }
        }
        Err(e) => {
            AddChangelogResponse {
                success: false,
                message: format!("添加失败: {}", e),
                data: None,
            }
        }
    }
}

pub async fn delete_changelog(user_id: u32, changelog_id: u32) -> ChangelogResponse {
    println!("[Changelog] 删除更新日志: user_id={}, changelog_id={}", user_id, changelog_id);
    
    match check_is_admin(user_id).await {
        Ok(true) => {},
        Ok(false) => {
            return ChangelogResponse {
                success: false,
                message: "权限不足，只有管理员可以删除更新日志".to_string(),
                data: None,
            };
        },
        Err(e) => {
            return ChangelogResponse {
                success: false,
                message: e,
                data: None,
            };
        }
    }
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            return ChangelogResponse {
                success: false,
                message: e,
                data: None,
            };
        }
    };
    
    let delete_result = conn.exec_drop(
        "DELETE FROM changelogs WHERE id = ?",
        (&changelog_id,)
    );
    
    match delete_result {
        Ok(_) => {
            println!("[Changelog] 删除成功: id={}", changelog_id);
            ChangelogResponse {
                success: true,
                message: "删除成功".to_string(),
                data: None,
            }
        }
        Err(e) => {
            ChangelogResponse {
                success: false,
                message: format!("删除失败: {}", e),
                data: None,
            }
        }
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
