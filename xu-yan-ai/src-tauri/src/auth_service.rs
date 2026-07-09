use crate::database;
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{NaiveDate, Utc};
use rand::Rng;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: u32,
    pub nickname: String,
    pub account: String,
    pub email: String,
    pub company: String,
    pub department: String,
    pub remaining_days: i32,
    pub login_limit: i32,
    pub online_count: i32,
    pub is_admin: bool,
    pub password_hash: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub success: bool,
    pub message: String,
    pub user: Option<User>,
}

struct DbUser {
    user: User,
    password: String,
    last_deducted_date: Option<String>,
}

fn auth_error(message: impl Into<String>) -> AuthResponse {
    AuthResponse {
        success: false,
        message: message.into(),
        user: None,
    }
}

fn fetch_user(conn: &Connection, account: &str) -> Result<Option<DbUser>, String> {
    conn.query_row(
        "SELECT id, nickname, account, email, password, company, department,
                remaining_days, login_limit, online_count, last_deducted_date, is_admin
         FROM users WHERE account = ?1",
        params![account],
        |row| {
            let password: String = row.get(4)?;
            Ok(DbUser {
                user: User {
                    id: row.get::<_, i64>(0)? as u32,
                    nickname: row.get(1)?,
                    account: row.get(2)?,
                    email: row.get(3)?,
                    company: row.get(5)?,
                    department: row.get(6)?,
                    remaining_days: row.get(7)?,
                    login_limit: row.get(8)?,
                    online_count: row.get(9)?,
                    is_admin: row.get::<_, i64>(11)? != 0,
                    password_hash: None,
                },
                password,
                last_deducted_date: row.get(10)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("查询用户失败: {e}"))
}

fn validate_password_strength(password: &str) -> Result<(), String> {
    if password.len() < 8 {
        return Err("密码长度至少8位".into());
    }
    if !password.chars().any(char::is_uppercase)
        || !password.chars().any(char::is_lowercase)
        || !password.chars().any(char::is_numeric)
    {
        return Err("密码必须包含大小写字母和数字".into());
    }
    Ok(())
}

fn validate_account(account: &str) -> Result<(), String> {
    let length = account.chars().count();
    if !(3..=32).contains(&length) {
        return Err("用户名长度需在3-32字符之间".into());
    }
    if !account
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
    {
        return Err("用户名只能包含中文、英文字母、数字、下划线和短横线".into());
    }
    Ok(())
}

fn get_online_count(conn: &Connection, user_id: u32) -> i32 {
    conn.query_row(
        "SELECT COUNT(*) FROM user_sessions WHERE user_id = ?1",
        params![user_id],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

fn update_remaining_days(conn: &Connection, db_user: &mut DbUser) {
    let today = Utc::now().date_naive();
    let today_text = today.format("%Y-%m-%d").to_string();
    let last_date = db_user
        .last_deducted_date
        .as_deref()
        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());

    if let Some(last) = last_date {
        let elapsed = (today - last).num_days() as i32;
        if elapsed > 0 && !db_user.user.is_admin {
            db_user.user.remaining_days = (db_user.user.remaining_days - elapsed).max(0);
        }
    }
    let _ = conn.execute(
        "UPDATE users SET remaining_days = ?1, last_deducted_date = ?2 WHERE id = ?3",
        params![db_user.user.remaining_days, today_text, db_user.user.id],
    );
}

fn generate_session_token() -> String {
    rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

pub async fn login(account: String, password: String, instance_id: String) -> AuthResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => return auth_error(e),
    };
    let mut db_user = match fetch_user(&conn, account.trim()) {
        Ok(Some(user)) => user,
        Ok(None) => return auth_error("账号不存在"),
        Err(e) => return auth_error(e),
    };
    if !verify(&password, &db_user.password).unwrap_or(false) {
        return auth_error("密码错误");
    }

    let instance_id = if instance_id.trim().is_empty() {
        format!("desktop-{}", db_user.user.id)
    } else {
        instance_id
    };
    let online_count = get_online_count(&conn, db_user.user.id);
    let existing = conn
        .query_row(
            "SELECT 1 FROM user_sessions WHERE user_id = ?1 AND instance_id = ?2",
            params![db_user.user.id, instance_id],
            |_| Ok(()),
        )
        .optional()
        .unwrap_or(None)
        .is_some();
    if online_count >= db_user.user.login_limit && !existing {
        return auth_error(format!(
            "该账号已达到登录上限({online_count}/{})",
            db_user.user.login_limit
        ));
    }

    update_remaining_days(&conn, &mut db_user);
    let token = generate_session_token();
    if let Err(e) = conn.execute(
        "INSERT INTO user_sessions (user_id, instance_id, session_token)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(user_id, instance_id) DO UPDATE SET session_token = excluded.session_token",
        params![db_user.user.id, instance_id, token],
    ) {
        return auth_error(format!("创建登录会话失败: {e}"));
    }
    db_user.user.online_count = get_online_count(&conn, db_user.user.id);
    db_user.user.password_hash = Some(db_user.password);
    let _ = conn.execute(
        "UPDATE users SET online_count = ?1 WHERE id = ?2",
        params![db_user.user.online_count, db_user.user.id],
    );
    AuthResponse {
        success: true,
        message: "登录成功".into(),
        user: Some(db_user.user),
    }
}

pub async fn register(
    nickname: String,
    account: String,
    password: String,
    company: String,
    department: String,
) -> AuthResponse {
    let nickname = nickname.trim();
    let account = account.trim();
    if !(2..=20).contains(&nickname.chars().count()) {
        return auth_error("昵称长度需在2-20字符之间");
    }
    if let Err(e) = validate_account(account) {
        return auth_error(e);
    }
    if let Err(e) = validate_password_strength(&password) {
        return auth_error(e);
    }
    let password = match hash(password, DEFAULT_COST) {
        Ok(value) => value,
        Err(e) => return auth_error(format!("密码加密失败: {e}")),
    };
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => return auth_error(e),
    };
    let user_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap_or(0);
    let is_first_user = user_count == 0;
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let result = conn.execute(
        "INSERT INTO users
         (nickname, account, password, company, department, remaining_days,
          login_limit, last_deducted_date, is_admin)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            nickname,
            account,
            password,
            company.trim(),
            department.trim(),
            if is_first_user { 9999 } else { 30 },
            if is_first_user { 10 } else { 1 },
            today,
            is_first_user as i32
        ],
    );
    match result {
        Ok(_) => AuthResponse {
            success: true,
            message: if is_first_user {
                "注册成功，首个用户已设为管理员".into()
            } else {
                "注册成功，请登录".into()
            },
            user: None,
        },
        Err(e) if e.to_string().contains("UNIQUE") => auth_error("该用户名已被注册"),
        Err(e) => auth_error(format!("注册失败: {e}")),
    }
}

pub async fn logout(account: &str, instance_id: &str) -> AuthResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => return auth_error(e),
    };
    if let Ok(Some(user)) = fetch_user(&conn, account) {
        let _ = conn.execute(
            "DELETE FROM user_sessions WHERE user_id = ?1 AND instance_id = ?2",
            params![user.user.id, instance_id],
        );
        let count = get_online_count(&conn, user.user.id);
        let _ = conn.execute(
            "UPDATE users SET online_count = ?1 WHERE id = ?2",
            params![count, user.user.id],
        );
    }
    AuthResponse {
        success: true,
        message: "退出登录成功".into(),
        user: None,
    }
}

pub async fn change_password(
    account: String,
    old_password: String,
    new_password: String,
) -> AuthResponse {
    if let Err(e) = validate_password_strength(&new_password) {
        return auth_error(e);
    }
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => return auth_error(e),
    };
    let user = match fetch_user(&conn, &account) {
        Ok(Some(user)) => user,
        Ok(None) => return auth_error("账号不存在"),
        Err(e) => return auth_error(e),
    };
    if !verify(old_password, &user.password).unwrap_or(false) {
        return auth_error("原密码错误");
    }
    let password = match hash(new_password, DEFAULT_COST) {
        Ok(value) => value,
        Err(e) => return auth_error(format!("密码加密失败: {e}")),
    };
    match conn.execute(
        "UPDATE users SET password = ?1 WHERE account = ?2",
        params![password, account],
    ) {
        Ok(_) => AuthResponse {
            success: true,
            message: "密码修改成功".into(),
            user: None,
        },
        Err(e) => auth_error(format!("密码修改失败: {e}")),
    }
}

pub async fn get_user_info(account: &str) -> AuthResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => return auth_error(e),
    };
    match fetch_user(&conn, account) {
        Ok(Some(mut user)) => {
            update_remaining_days(&conn, &mut user);
            AuthResponse {
                success: true,
                message: "获取用户信息成功".into(),
                user: Some(user.user),
            }
        }
        Ok(None) => auth_error("用户不存在"),
        Err(e) => auth_error(e),
    }
}

pub async fn verify_user_status(account: &str, stored_hash: &str) -> Result<bool, String> {
    let conn = database::connection()?;
    Ok(fetch_user(&conn, account)?
        .map(|user| !user.password.is_empty() && user.password == stored_hash)
        .unwrap_or(false))
}

pub async fn verify_user_credentials(account: &str, password: &str) -> AuthResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => return auth_error(e),
    };
    match fetch_user(&conn, account) {
        Ok(Some(mut user)) if verify(password, &user.password).unwrap_or(false) => {
            user.user.password_hash = Some(user.password);
            AuthResponse {
                success: true,
                message: "验证成功".into(),
                user: Some(user.user),
            }
        }
        Ok(Some(_)) => auth_error("密码错误"),
        Ok(None) => auth_error("用户不存在"),
        Err(e) => auth_error(e),
    }
}

#[tauri::command]
pub async fn tauri_login(account: String, password: String, instance_id: String) -> AuthResponse {
    login(account, password, instance_id).await
}

#[tauri::command]
pub async fn tauri_register(
    nickname: String,
    account: String,
    password: String,
    company: String,
    department: String,
) -> AuthResponse {
    register(nickname, account, password, company, department).await
}

#[tauri::command]
pub async fn tauri_logout(account: String, instance_id: String) -> AuthResponse {
    logout(&account, &instance_id).await
}

#[tauri::command]
pub async fn tauri_change_password(
    account: String,
    old_password: String,
    new_password: String,
) -> AuthResponse {
    change_password(account, old_password, new_password).await
}

#[tauri::command]
pub async fn tauri_get_user_info(account: String) -> AuthResponse {
    get_user_info(&account).await
}

#[tauri::command]
pub async fn tauri_refresh_user_info(account: String) -> AuthResponse {
    get_user_info(&account).await
}

#[tauri::command]
pub async fn tauri_verify_credentials(account: String, password: String) -> AuthResponse {
    verify_user_credentials(&account, &password).await
}

#[tauri::command]
pub async fn tauri_check_network() -> bool {
    database::connection().is_ok()
}

#[tauri::command]
pub async fn tauri_quick_check_connection() -> Result<(), String> {
    let conn = database::connection()?;
    conn.query_row("SELECT 1", [], |_| Ok(()))
        .map_err(|e| format!("本地数据库检查失败: {e}"))
}

#[tauri::command]
pub async fn tauri_verify_user_status(
    account: String,
    stored_hash: String,
) -> Result<bool, String> {
    verify_user_status(&account, &stored_hash).await
}

#[derive(Debug, Serialize)]
pub struct GetUserEmailResponse {
    pub success: bool,
    pub email: Option<String>,
    pub message: String,
}

#[tauri::command]
pub async fn tauri_get_user_email(account: String) -> GetUserEmailResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return GetUserEmailResponse {
                success: false,
                email: None,
                message: e,
            }
        }
    };
    match fetch_user(&conn, &account) {
        Ok(Some(user)) if !user.user.email.is_empty() => GetUserEmailResponse {
            success: true,
            email: Some(user.user.email),
            message: "获取成功".into(),
        },
        _ => GetUserEmailResponse {
            success: false,
            email: None,
            message: "用户未设置邮箱".into(),
        },
    }
}

#[derive(Debug, Serialize)]
pub struct UsersListResponse {
    pub success: bool,
    pub message: String,
    pub users: Vec<User>,
}

#[tauri::command]
pub async fn tauri_get_all_users() -> UsersListResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return UsersListResponse {
                success: false,
                message: e,
                users: vec![],
            }
        }
    };
    let mut statement = match conn.prepare(
        "SELECT id, nickname, account, email, company, department,
                remaining_days, login_limit, online_count, is_admin
         FROM users ORDER BY id DESC",
    ) {
        Ok(value) => value,
        Err(e) => {
            return UsersListResponse {
                success: false,
                message: e.to_string(),
                users: vec![],
            }
        }
    };
    let users = statement
        .query_map([], |row| {
            Ok(User {
                id: row.get::<_, i64>(0)? as u32,
                nickname: row.get(1)?,
                account: row.get(2)?,
                email: row.get(3)?,
                company: row.get(4)?,
                department: row.get(5)?,
                remaining_days: row.get(6)?,
                login_limit: row.get(7)?,
                online_count: row.get(8)?,
                is_admin: row.get::<_, i64>(9)? != 0,
                password_hash: None,
            })
        })
        .and_then(Iterator::collect);
    match users {
        Ok(users) => UsersListResponse {
            success: true,
            message: "获取成功".into(),
            users,
        },
        Err(e) => UsersListResponse {
            success: false,
            message: format!("查询失败: {e}"),
            users: vec![],
        },
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub nickname: String,
    pub email: String,
    pub company: String,
    pub department: String,
    pub remaining_days: i32,
    pub login_limit: i32,
    pub is_admin: bool,
}

#[derive(Debug, Serialize)]
pub struct UpdateUserResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn tauri_update_user(user_id: u32, updates: UpdateUserRequest) -> UpdateUserResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return UpdateUserResponse {
                success: false,
                message: e,
            }
        }
    };
    let result = conn.execute(
        "UPDATE users SET nickname=?1, email=?2, company=?3, department=?4,
         remaining_days=?5, login_limit=?6, is_admin=?7 WHERE id=?8",
        params![
            updates.nickname,
            updates.email,
            updates.company,
            updates.department,
            updates.remaining_days.max(0),
            updates.login_limit.max(1),
            updates.is_admin as i32,
            user_id
        ],
    );
    match result {
        Ok(0) => UpdateUserResponse {
            success: false,
            message: "用户不存在".into(),
        },
        Ok(_) => UpdateUserResponse {
            success: true,
            message: "用户更新成功".into(),
        },
        Err(e) => UpdateUserResponse {
            success: false,
            message: format!("更新失败: {e}"),
        },
    }
}

#[derive(Debug, Serialize)]
pub struct DeleteUserResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn tauri_delete_user(user_id: u32) -> DeleteUserResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return DeleteUserResponse {
                success: false,
                message: e,
            }
        }
    };
    let target_admin: bool = conn
        .query_row(
            "SELECT is_admin FROM users WHERE id=?1",
            params![user_id],
            |r| r.get::<_, i64>(0),
        )
        .optional()
        .unwrap_or(None)
        .map(|v| v != 0)
        .unwrap_or(false);
    let admin_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users WHERE is_admin=1", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    if target_admin && admin_count <= 1 {
        return DeleteUserResponse {
            success: false,
            message: "不能删除最后一个管理员".into(),
        };
    }
    match conn.execute("DELETE FROM users WHERE id=?1", params![user_id]) {
        Ok(0) => DeleteUserResponse {
            success: false,
            message: "用户不存在".into(),
        },
        Ok(_) => DeleteUserResponse {
            success: true,
            message: "用户删除成功".into(),
        },
        Err(e) => DeleteUserResponse {
            success: false,
            message: format!("删除失败: {e}"),
        },
    }
}

#[derive(Debug, Serialize)]
pub struct ForceLogoutResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn tauri_force_logout(account: String, instance_id: String) -> ForceLogoutResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return ForceLogoutResponse {
                success: false,
                message: e,
            }
        }
    };
    let user = match fetch_user(&conn, &account) {
        Ok(Some(user)) => user,
        _ => {
            return ForceLogoutResponse {
                success: false,
                message: "用户不存在".into(),
            }
        }
    };
    let _ = conn.execute(
        "DELETE FROM user_sessions WHERE user_id=?1 AND instance_id=?2",
        params![user.user.id, instance_id],
    );
    let count = get_online_count(&conn, user.user.id);
    let _ = conn.execute(
        "UPDATE users SET online_count=?1 WHERE id=?2",
        params![count, user.user.id],
    );
    ForceLogoutResponse {
        success: true,
        message: format!("强制退出成功，剩余在线: {count}"),
    }
}

#[derive(Debug, Serialize)]
pub struct ResetOnlineCountResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn tauri_reset_online_count(user_id: u32) -> ResetOnlineCountResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return ResetOnlineCountResponse {
                success: false,
                message: e,
            }
        }
    };
    let _ = conn.execute(
        "DELETE FROM user_sessions WHERE user_id=?1",
        params![user_id],
    );
    match conn.execute(
        "UPDATE users SET online_count=0 WHERE id=?1",
        params![user_id],
    ) {
        Ok(0) => ResetOnlineCountResponse {
            success: false,
            message: "用户不存在".into(),
        },
        Ok(_) => ResetOnlineCountResponse {
            success: true,
            message: "在线数已重置为0".into(),
        },
        Err(e) => ResetOnlineCountResponse {
            success: false,
            message: e.to_string(),
        },
    }
}

#[derive(Debug, Serialize)]
pub struct RestoreSessionResponse {
    pub success: bool,
    pub message: String,
    pub user: Option<User>,
}

#[tauri::command]
pub async fn tauri_restore_session(account: String, instance_id: String) -> RestoreSessionResponse {
    let conn = match database::connection() {
        Ok(conn) => conn,
        Err(e) => {
            return RestoreSessionResponse {
                success: false,
                message: e,
                user: None,
            }
        }
    };
    let mut db_user = match fetch_user(&conn, &account) {
        Ok(Some(user)) => user,
        _ => {
            return RestoreSessionResponse {
                success: false,
                message: "用户不存在".into(),
                user: None,
            }
        }
    };
    update_remaining_days(&conn, &mut db_user);
    let existing: Option<String> = conn
        .query_row(
            "SELECT session_token FROM user_sessions WHERE user_id=?1 AND instance_id=?2",
            params![db_user.user.id, instance_id],
            |row| row.get(0),
        )
        .optional()
        .unwrap_or(None);
    if existing.is_none() {
        return RestoreSessionResponse {
            success: false,
            message: "登录会话已失效，请重新登录".into(),
            user: None,
        };
    }
    db_user.user.online_count = get_online_count(&conn, db_user.user.id);
    RestoreSessionResponse {
        success: true,
        message: "会话恢复成功".into(),
        user: Some(db_user.user),
    }
}
