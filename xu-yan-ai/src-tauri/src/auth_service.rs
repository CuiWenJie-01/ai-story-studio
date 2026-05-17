use serde::{Deserialize, Serialize};
use mysql::*;
use mysql::prelude::*;
use bcrypt::{hash, verify, DEFAULT_COST};
use rand::Rng;
use chrono::{Utc, NaiveDate};

const DB_HOST: &str = "mysql6.sqlpub.com";
const DB_PORT: u16 = 3311;
const DB_NAME: &str = "gujieuserdata";
const DB_USER: &str = "xiaoxinna";
const DB_PASS: &str = "hBeB6u5wHdh032GM";

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
    pub password_hash: Option<String>, // 用于前端存储和验证
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub success: bool,
    pub message: String,
    pub user: Option<User>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub account: String,
    pub password: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub nickname: String,
    pub account: String,
    pub password: String,
    pub company: String,
    pub department: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub account: String,
    pub old_password: String,
    pub new_password: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub account: String,
    pub session_token: String,
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

fn ensure_sessions_table(conn: &mut PooledConn) -> Result<(), String> {
    conn.exec_drop(
        "CREATE TABLE IF NOT EXISTS user_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            instance_id VARCHAR(64) NOT NULL,
            session_token VARCHAR(64) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_user_instance (user_id, instance_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        (),
    ).map_err(|e| format!("创建会话表失败: {}", e))
}

fn get_online_count(conn: &mut PooledConn, user_id: u32) -> i32 {
    conn.exec_first(
        "SELECT COUNT(*) FROM user_sessions WHERE user_id = ?",
        (&user_id,)
    ).ok().flatten().unwrap_or(0)
}

fn generate_session_token() -> String {
    let mut rng = rand::thread_rng();
    let token: String = (0..32)
        .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
        .collect();
    token
}

fn validate_password_strength(password: &str) -> Result<(), String> {
    if password.len() < 8 {
        return Err("密码长度至少8位".to_string());
    }
    let has_upper = password.chars().any(|c| c.is_uppercase());
    let has_lower = password.chars().any(|c| c.is_lowercase());
    let has_digit = password.chars().any(|c| c.is_numeric());
    
    if !has_upper || !has_lower || !has_digit {
        return Err("密码必须包含大小写字母和数字".to_string());
    }
    Ok(())
}

fn validate_account_format(account: &str) -> Result<(), String> {
    let email_regex = regex::Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    let phone_regex = regex::Regex::new(r"^1[3-9]\d{9}$").unwrap();
    
    if email_regex.is_match(account) || phone_regex.is_match(account) {
        Ok(())
    } else {
        Err("账号格式不正确，请输入邮箱或手机号".to_string())
    }
}

pub async fn login(account: String, password: String, instance_id: String) -> AuthResponse {
    println!("[Auth] 尝试登录: {} (实例: {})", account, instance_id);
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] {}", e);
            return AuthResponse {
                success: false,
                message: e,
                user: None,
            };
        }
    };
    
    if let Err(e) = ensure_sessions_table(&mut conn) {
        println!("[Auth] {}", e);
    }
    
    println!("[Auth] 数据库连接成功，查询用户...");
    
    let result: Option<(u32, String, String, String, String, i32, i32, Option<NaiveDate>, bool)> = conn
        .exec_first(
            "SELECT id, nickname, email, password, company, remaining_days, login_limit, last_deducted_date, is_admin FROM users WHERE account = ?",
            (&account,)
        )
        .ok()
        .flatten();
    
    println!("[Auth] 查询结果: {:?}", result.is_some());
    
    match result {
        Some((id, nickname, email, hashed_password, company, mut remaining_days, login_limit, last_deducted_date, is_admin)) => {
            match verify(&password, &hashed_password) {
                Ok(valid) if valid => {
                    let online_count = get_online_count(&mut conn, id);
                    
                    if online_count >= login_limit {
                        // 检查是否是同一实例重复登录（允许替换）
                        let existing_instance: Option<String> = conn
                            .exec_first(
                                "SELECT session_token FROM user_sessions WHERE user_id = ? AND instance_id = ?",
                                (&id, &instance_id)
                            )
                            .ok()
                            .flatten();
                        
                        if existing_instance.is_none() {
                            return AuthResponse {
                                success: false,
                                message: format!("该账号已达到登录上限({}/{})", online_count, login_limit),
                                user: None,
                            };
                        }
                    }
                    
                    let today = Utc::now().date_naive();
                    let today_str = today.format("%Y-%m-%d").to_string();
                    
                    if let Some(last_date) = last_deducted_date {
                        if last_date < today {
                            let days_to_deduct = (today - last_date).num_days() as i32;
                            if days_to_deduct > 0 {
                                remaining_days = (remaining_days - days_to_deduct).max(0);
                                let _ = conn.exec_drop(
                                    "UPDATE users SET remaining_days = ?, last_deducted_date = ? WHERE id = ?",
                                    (&remaining_days, &today_str, &id)
                                );
                                println!("[Auth] 扣除{}天, 剩余{}天", days_to_deduct, remaining_days);
                            }
                        }
                    } else {
                        let _ = conn.exec_drop(
                            "UPDATE users SET last_deducted_date = ? WHERE id = ?",
                            (&today_str, &id)
                        );
                    }
                    
                    let session_token = generate_session_token();
                    
                    let department: String = conn
                        .exec_first(
                            "SELECT department FROM users WHERE id = ?",
                            (&id,)
                        )
                        .ok()
                        .flatten()
                        .unwrap_or_default();
                    
                    // 插入或替换该实例的会话记录
                    let _ = conn.exec_drop(
                        "INSERT INTO user_sessions (user_id, instance_id, session_token) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE session_token = ?",
                        (&id, &instance_id, &session_token, &session_token)
                    );
                    
                    let new_online_count = get_online_count(&mut conn, id);
                    let _ = conn.exec_drop(
                        "UPDATE users SET online_count = ? WHERE id = ?",
                        (&new_online_count, &id)
                    );
                    
                    println!("[Auth] 登录成功: {} (剩余{}天, 在线{}/{})", nickname, remaining_days, new_online_count, login_limit);
                    
                    AuthResponse {
                        success: true,
                        message: "登录成功".to_string(),
                        user: Some(User {
                            id,
                            nickname,
                            account,
                            email,
                            company,
                            department,
                            remaining_days,
                            login_limit,
                            online_count: new_online_count,
                            is_admin,
                            password_hash: Some(hashed_password),
                        }),
                    }
                }
                _ => {
                    AuthResponse {
                        success: false,
                        message: "密码错误".to_string(),
                        user: None,
                    }
                }
            }
        }
        None => {
            AuthResponse {
                success: false,
                message: "账号不存在".to_string(),
                user: None,
            }
        }
    }
}

pub async fn register(
    nickname: String,
    account: String,
    email: String,
    password: String,
    company: String,
    department: String
) -> AuthResponse {
    println!("[Auth] 尝试注册: {}, 邮箱: {}", account, email);
    
    if nickname.len() < 2 || nickname.len() > 20 {
        println!("[Auth] 昵称长度不正确");
        return AuthResponse {
            success: false,
            message: "昵称长度需在2-20字符之间".to_string(),
            user: None,
        };
    }
    
    if let Err(e) = validate_account_format(&account) {
        println!("[Auth] 账号格式不正确: {}", e);
        return AuthResponse {
            success: false,
            message: e,
            user: None,
        };
    }
    
    // 验证邮箱格式
    let email_regex = regex::Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    if !email_regex.is_match(&email) {
        println!("[Auth] 邮箱格式不正确");
        return AuthResponse {
            success: false,
            message: "邮箱格式不正确".to_string(),
            user: None,
        };
    }
    
    if let Err(e) = validate_password_strength(&password) {
        println!("[Auth] 密码强度不够: {}", e);
        return AuthResponse {
            success: false,
            message: e,
            user: None,
        };
    }
    
    println!("[Auth] 开始加密密码...");
    
    let hashed_password = match hash(&password, DEFAULT_COST) {
        Ok(h) => {
            println!("[Auth] 密码加密完成");
            h
        },
        Err(e) => {
            println!("[Auth] 密码加密失败: {}", e);
            return AuthResponse {
                success: false,
                message: format!("密码加密失败: {}", e),
                user: None,
            };
        }
    };
    
    println!("[Auth] 连接数据库...");
    
    let mut conn = match get_conn() {
        Ok(c) => {
            println!("[Auth] 数据库连接成功");
            c
        }
        Err(e) => {
            println!("[Auth] {}", e);
            return AuthResponse {
                success: false,
                message: e,
                user: None,
            };
        }
    };
    
    println!("[Auth] 检查账号是否存在...");
    
    let existing: Option<i32> = conn
        .exec_first("SELECT id FROM users WHERE account = ?", (&account,))
        .ok()
        .flatten();
    
    if existing.is_some() {
        println!("[Auth] 账号已存在");
        return AuthResponse {
            success: false,
            message: "该账号已被注册".to_string(),
            user: None,
        };
    }
    
    println!("[Auth] 检查邮箱是否已存在...");
    
    let email_exists: Option<i32> = conn
        .exec_first("SELECT id FROM users WHERE email = ?", (&email,))
        .ok()
        .flatten();
    
    if email_exists.is_some() {
        println!("[Auth] 邮箱已被注册");
        return AuthResponse {
            success: false,
            message: "该邮箱已被注册".to_string(),
            user: None,
        };
    }
    
    println!("[Auth] 插入新用户...");
    
    let today_str = Utc::now().format("%Y-%m-%d").to_string();
    
    let insert_result = conn.exec_drop(
        "INSERT INTO users (nickname, account, email, password, company, department, remaining_days, login_limit, online_count, last_deducted_date) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, ?)",
        (&nickname, &account, &email, &hashed_password, &company, &department, &today_str)
    );
    
    match insert_result {
        Ok(_) => {
            println!("[Auth] 注册成功: {}", nickname);
            AuthResponse {
                success: true,
                message: "注册成功，请登录".to_string(),
                user: None,
            }
        }
        Err(e) => {
            println!("[Auth] 注册失败: {}", e);
            AuthResponse {
                success: false,
                message: format!("注册失败: {}", e),
                user: None,
            }
        }
    }
}

pub async fn logout(account: &str, instance_id: &str) -> AuthResponse {
    println!("[Auth] 尝试退出登录: {} (实例: {})", account, instance_id);
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => return AuthResponse {
            success: false,
            message: e,
            user: None,
        },
    };
    
    if let Err(_) = ensure_sessions_table(&mut conn) {}

    // 获取 user_id
    let user_id: Option<u32> = conn
        .exec_first("SELECT id FROM users WHERE account = ?", (&account,))
        .ok()
        .flatten();

    if let Some(uid) = user_id {
        let _ = conn.exec_drop(
            "DELETE FROM user_sessions WHERE user_id = ? AND instance_id = ?",
            (&uid, &instance_id)
        );
        
        let new_online_count = get_online_count(&mut conn, uid);
        let _ = conn.exec_drop(
            "UPDATE users SET online_count = ? WHERE id = ?",
            (&new_online_count, &uid)
        );
        
        println!("[Auth] 退出登录成功: {} (剩余在线: {})", account, new_online_count);
    } else {
        println!("[Auth] 退出登录: 用户 {} 不存在", account);
    }
    
    AuthResponse {
        success: true,
        message: "退出登录成功".to_string(),
        user: None,
    }
}

pub async fn change_password(
    account: String,
    old_password: String,
    new_password: String
) -> AuthResponse {
    println!("[Auth] 尝试修改密码: {}", account);
    
    if let Err(e) = validate_password_strength(&new_password) {
        return AuthResponse {
            success: false,
            message: e,
            user: None,
        };
    }
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => return AuthResponse {
            success: false,
            message: e,
            user: None,
        },
    };
    
    let result: Option<(u32, String)> = conn
        .exec_first(
            "SELECT id, password FROM users WHERE account = ?",
            (&account,)
        )
        .ok()
        .flatten();
    
    match result {
        Some((_id, hashed_password)) => {
            match verify(&old_password, &hashed_password) {
                Ok(valid) if valid => {
                    let new_hashed = match hash(&new_password, DEFAULT_COST) {
                        Ok(h) => h,
                        Err(e) => return AuthResponse {
                            success: false,
                            message: format!("密码加密失败: {}", e),
                            user: None,
                        },
                    };
                    
                    let _ = conn.exec_drop(
                        "UPDATE users SET password = ? WHERE account = ?",
                        (&new_hashed, &account)
                    );
                    
                    println!("[Auth] 密码修改成功: {}", account);
                    
                    AuthResponse {
                        success: true,
                        message: "密码修改成功".to_string(),
                        user: None,
                    }
                }
                _ => {
                    AuthResponse {
                        success: false,
                        message: "原密码错误".to_string(),
                        user: None,
                    }
                }
            }
        }
        None => {
            AuthResponse {
                success: false,
                message: "账号不存在".to_string(),
                user: None,
            }
        }
    }
}

pub async fn get_user_info(account: &str) -> AuthResponse {
    // 使用独立作用域确保连接立即释放
    let user_result = {
        let mut conn = match get_conn() {
            Ok(c) => c,
            Err(e) => return AuthResponse {
                success: false,
                message: e,
                user: None,
            },
        };
        
        let result: Option<(u32, String, String, String, String, i32, i32, i32, Option<NaiveDate>, bool)> = conn
            .exec_first(
                "SELECT id, nickname, email, company, department, remaining_days, login_limit, online_count, last_deducted_date, is_admin FROM users WHERE account = ?",
                (&account,)
            )
            .ok()
            .flatten();
        
        match result {
            Some((id, nickname, email, company, department, mut remaining_days, login_limit, online_count, last_deducted_date, is_admin)) => {
                let today = Utc::now().date_naive();
                let today_str = today.format("%Y-%m-%d").to_string();
                
                if let Some(last_date) = last_deducted_date {
                    if last_date < today {
                        let days_to_deduct = (today - last_date).num_days() as i32;
                        if days_to_deduct > 0 {
                            remaining_days = (remaining_days - days_to_deduct).max(0);
                            let _ = conn.exec_drop(
                                "UPDATE users SET remaining_days = ?, last_deducted_date = ? WHERE id = ?",
                                (&remaining_days, &today_str, &id)
                            );
                            println!("[Auth] 刷新时扣除{}天, 剩余{}天", days_to_deduct, remaining_days);
                        }
                    }
                } else {
                    let _ = conn.exec_drop(
                        "UPDATE users SET last_deducted_date = ? WHERE id = ?",
                        (&today_str, &id)
                    );
                }
                
                Some(User {
                    id,
                    nickname,
                    account: account.to_string(),
                    email,
                    company,
                    department,
                    remaining_days,
                    login_limit,
                    online_count,
                    is_admin,
                    password_hash: None, // get_user_info 不返回密码哈希
                })
            }
            None => None,
        }
        // conn 在这里离开作用域，自动释放回连接池
    };
    
    match user_result {
        Some(user) => AuthResponse {
            success: true,
            message: "获取用户信息成功".to_string(),
            user: Some(user),
        },
        None => AuthResponse {
            success: false,
            message: "用户不存在".to_string(),
            user: None,
        },
    }
}

pub async fn refresh_user_info(account: &str) -> AuthResponse {
    println!("[Auth] 刷新用户信息: {}", account);
    get_user_info(account).await
}

/// 启动时验证用户状态 - 检查用户是否存在且密码哈希是否匹配
/// 参数: account - 用户账号, stored_hash - 前端存储的密码哈希
/// 返回: Ok(true) - 用户有效, Ok(false) - 用户不存在或密码已修改, Err - 数据库错误
pub async fn verify_user_status(account: &str, stored_hash: &str) -> Result<bool, String> {
    println!("[Auth] 验证用户状态: {}", account);
    
    // 使用独立作用域确保连接立即释放
    let is_valid = {
        let mut conn = match get_conn() {
            Ok(c) => c,
            Err(e) => {
                println!("[Auth] 验证用户状态: 数据库连接失败 - {}", e);
                return Err(e);
            }
        };
        
        // 查询用户信息和密码
        let result: Option<(u32, String)> = conn
            .exec_first(
                "SELECT id, password FROM users WHERE account = ?",
                (&account,)
            )
            .ok()
            .flatten();
        
        match result {
            Some((_, current_hash)) => {
                // 检查密码是否为空或被删除
                if current_hash.is_empty() || current_hash.len() < 10 {
                    println!("[Auth] 验证用户状态: 用户 {} 密码无效或被删除", account);
                    false
                } else if current_hash != stored_hash {
                    // 密码哈希不匹配，说明密码已被修改
                    println!("[Auth] 验证用户状态: 用户 {} 密码已修改", account);
                    false
                } else {
                    println!("[Auth] 验证用户状态: 用户 {} 密码验证通过", account);
                    true
                }
            }
            None => {
                println!("[Auth] 验证用户状态: 用户 {} 不存在", account);
                false
            }
        }
        // conn 在这里离开作用域，自动释放回连接池
    };
    
    Ok(is_valid)
}

/// 验证用户凭证（用于启动时验证）
/// 只验证用户是否存在和密码是否正确，不更新在线状态
pub async fn verify_user_credentials(account: &str, password: &str) -> AuthResponse {
    println!("[Auth] 验证用户凭证: {}", account);
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] 数据库连接失败: {}", e);
            return AuthResponse {
                success: false,
                message: e,
                user: None,
            };
        }
    };
    
    let result: Option<(u32, String, String, String, String, String, i32, i32, i32, bool)> = conn
        .exec_first(
            "SELECT id, nickname, email, password, company, department, remaining_days, login_limit, online_count, is_admin FROM users WHERE account = ?",
            (&account,)
        )
        .ok()
        .flatten();
    
    match result {
        Some((id, nickname, email, hashed_password, company, department, remaining_days, login_limit, online_count, is_admin)) => {
            match verify(&password, &hashed_password) {
                Ok(valid) if valid => {
                    println!("[Auth] 凭证验证成功: {}", account);
                    AuthResponse {
                        success: true,
                        message: "验证成功".to_string(),
                        user: Some(User {
                            id,
                            nickname,
                            account: account.to_string(),
                            email,
                            company,
                            department,
                            remaining_days,
                            login_limit,
                            online_count,
                            is_admin,
                            password_hash: Some(hashed_password),
                        }),
                    }
                }
                _ => {
                    println!("[Auth] 凭证验证失败: 密码错误");
                    AuthResponse {
                        success: false,
                        message: "密码错误".to_string(),
                        user: None,
                    }
                }
            }
        }
        None => {
            println!("[Auth] 凭证验证失败: 用户不存在");
            AuthResponse {
                success: false,
                message: "用户不存在".to_string(),
                user: None,
            }
        }
    }
}

/// 快速验证数据库连接 - 只查询不返回数据，立即释放连接
pub async fn quick_check_connection() -> Result<(), String> {
    // 使用独立作用域确保连接立即释放
    {
        let mut conn = match get_conn() {
            Ok(c) => c,
            Err(e) => {
                println!("[Auth] 快速检测: 数据库连接失败 - {}", e);
                return Err(e);
            }
        };
        
        // 执行一个简单的查询来验证连接
        let result: Result<Option<i32>, _> = conn.query_first("SELECT 1");
        
        match result {
            Ok(_) => {
                println!("[Auth] 快速检测: 数据库连接正常");
                // conn 在这里离开作用域，自动释放回连接池
            }
            Err(e) => {
                println!("[Auth] 快速检测: 查询失败 - {}", e);
                return Err(format!("查询失败: {}", e));
            }
        }
    } // 连接在这里立即释放
    
    Ok(())
}

/// 检测网络连接状态
pub async fn check_network_connection() -> bool {
    use std::net::TcpStream;
    use std::time::Duration;
    
    // 尝试连接数据库服务器（如果数据库能连上，说明有网络）
    let addr = format!("{}:{}", DB_HOST, DB_PORT);
    let socket_addr = match addr.parse::<std::net::SocketAddr>() {
        Ok(addr) => addr,
        Err(e) => {
            println!("[Auth] 网络连接检测: 地址解析失败 - {}", e);
            return false;
        }
    };
    
    match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(3)) {
        Ok(_) => {
            println!("[Auth] 网络连接检测: 正常");
            true
        }
        Err(e) => {
            println!("[Auth] 网络连接检测: 失败 - {}", e);
            false
        }
    }
}

#[tauri::command]
pub async fn tauri_verify_credentials(account: String, password: String) -> AuthResponse {
    verify_user_credentials(&account, &password).await
}

#[tauri::command]
pub async fn tauri_check_network() -> bool {
    check_network_connection().await
}

#[tauri::command]
pub async fn tauri_quick_check_connection() -> Result<(), String> {
    quick_check_connection().await
}

#[tauri::command]
pub async fn tauri_verify_user_status(account: String, stored_hash: String) -> Result<bool, String> {
    verify_user_status(&account, &stored_hash).await
}

#[tauri::command]
pub async fn tauri_login(account: String, password: String, instance_id: String) -> AuthResponse {
    login(account, password, instance_id).await
}

#[tauri::command]
pub async fn tauri_register(
    nickname: String,
    account: String,
    email: String,
    password: String,
    company: String,
    department: String
) -> AuthResponse {
    register(nickname, account, email, password, company, department).await
}

/// 获取用户邮箱
#[derive(Debug, Serialize)]
pub struct GetUserEmailResponse {
    pub success: bool,
    pub email: Option<String>,
    pub message: String,
}

#[tauri::command]
pub async fn tauri_get_user_email(account: String) -> GetUserEmailResponse {
    println!("[Auth] 获取用户邮箱: {}", account);
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] 数据库连接失败: {}", e);
            return GetUserEmailResponse {
                success: false,
                email: None,
                message: e,
            };
        }
    };
    
    let email: Option<String> = conn
        .exec_first("SELECT email FROM users WHERE account = ?", (&account,))
        .ok()
        .flatten();
    
    match email {
        Some(e) => {
            println!("[Auth] 获取到用户邮箱: {}", e);
            GetUserEmailResponse {
                success: true,
                email: Some(e),
                message: "获取成功".to_string(),
            }
        }
        None => {
            println!("[Auth] 用户邮箱不存在");
            GetUserEmailResponse {
                success: false,
                email: None,
                message: "用户邮箱不存在".to_string(),
            }
        }
    }
}

#[tauri::command]
pub async fn tauri_logout(account: String, instance_id: String) -> AuthResponse {
    logout(&account, &instance_id).await
}

#[tauri::command]
pub async fn tauri_change_password(
    account: String,
    old_password: String,
    new_password: String
) -> AuthResponse {
    change_password(account, old_password, new_password).await
}

#[tauri::command]
pub async fn tauri_get_user_info(account: String) -> AuthResponse {
    get_user_info(&account).await
}

#[tauri::command]
pub async fn tauri_refresh_user_info(account: String) -> AuthResponse {
    refresh_user_info(&account).await
}

// ==================== 用户管理命令 ====================

#[derive(Debug, Serialize)]
pub struct UsersListResponse {
    pub success: bool,
    pub message: String,
    pub users: Vec<User>,
}

/// 获取所有用户列表（仅管理员）
#[tauri::command]
pub async fn tauri_get_all_users() -> UsersListResponse {
    println!("[Auth] 获取所有用户列表");
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] 数据库连接失败: {}", e);
            return UsersListResponse {
                success: false,
                message: e,
                users: vec![],
            };
        }
    };
    
    let result: Result<Vec<(u32, String, String, Option<String>, String, String, i32, i32, i32, bool)>, _> = conn
        .exec(
            "SELECT id, account, nickname, email, company, department, remaining_days, login_limit, online_count, is_admin FROM users ORDER BY id DESC",
            ()
        );
    
    match result {
        Ok(rows) => {
            let users: Vec<User> = rows
                .into_iter()
                .map(|(id, account, nickname, email, company, department, remaining_days, login_limit, online_count, is_admin)| {
                    User {
                        id,
                        nickname,
                        account,
                        email: email.unwrap_or_default(),
                        company,
                        department,
                        remaining_days,
                        login_limit,
                        online_count,
                        is_admin,
                        password_hash: None,
                    }
                })
                .collect();
            
            println!("[Auth] 获取到 {} 个用户", users.len());
            
            UsersListResponse {
                success: true,
                message: format!("获取到 {} 个用户", users.len()),
                users,
            }
        }
        Err(e) => {
            println!("[Auth] 查询用户列表失败: {}", e);
            UsersListResponse {
                success: false,
                message: format!("查询失败: {}", e),
                users: vec![],
            }
        }
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

/// 更新用户信息（仅管理员）
#[tauri::command]
pub async fn tauri_update_user(user_id: u32, updates: UpdateUserRequest) -> UpdateUserResponse {
    println!("[Auth] 更新用户 {}: {:?}", user_id, updates);
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] 数据库连接失败: {}", e);
            return UpdateUserResponse {
                success: false,
                message: e,
            };
        }
    };
    
    // 检查用户是否存在
    let exists: Option<i32> = conn
        .exec_first("SELECT id FROM users WHERE id = ?", (&user_id,))
        .ok()
        .flatten();
    
    if exists.is_none() {
        return UpdateUserResponse {
            success: false,
            message: "用户不存在".to_string(),
        };
    }
    
    // 检查邮箱是否已被其他用户使用
    if !updates.email.is_empty() {
        let email_exists: Option<i32> = conn
            .exec_first("SELECT id FROM users WHERE email = ? AND id != ?", (&updates.email, &user_id))
            .ok()
            .flatten();
        
        if email_exists.is_some() {
            return UpdateUserResponse {
                success: false,
                message: "该邮箱已被其他用户使用".to_string(),
            };
        }
    }
    
    // 执行更新
    let result = conn.exec_drop(
        "UPDATE users SET nickname = ?, email = ?, company = ?, department = ?, remaining_days = ?, login_limit = ?, is_admin = ? WHERE id = ?",
        (&updates.nickname, &updates.email, &updates.company, &updates.department, &updates.remaining_days, &updates.login_limit, &updates.is_admin, &user_id)
    );
    
    match result {
        Ok(_) => {
            println!("[Auth] 用户 {} 更新成功", user_id);
            UpdateUserResponse {
                success: true,
                message: "用户更新成功".to_string(),
            }
        }
        Err(e) => {
            println!("[Auth] 用户 {} 更新失败: {}", user_id, e);
            UpdateUserResponse {
                success: false,
                message: format!("更新失败: {}", e),
            }
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DeleteUserResponse {
    pub success: bool,
    pub message: String,
}

/// 删除用户（仅管理员）
#[tauri::command]
pub async fn tauri_delete_user(user_id: u32) -> DeleteUserResponse {
    println!("[Auth] 删除用户 {}", user_id);
    
    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] 数据库连接失败: {}", e);
            return DeleteUserResponse {
                success: false,
                message: e,
            };
        }
    };
    
    // 检查用户是否存在
    let exists: Option<i32> = conn
        .exec_first("SELECT id FROM users WHERE id = ?", (&user_id,))
        .ok()
        .flatten();
    
    if exists.is_none() {
        return DeleteUserResponse {
            success: false,
            message: "用户不存在".to_string(),
        };
    }
    
    // 检查是否是最后一个管理员
    let admin_count: Option<i32> = conn
        .exec_first("SELECT COUNT(*) FROM users WHERE is_admin = 1", ())
        .ok()
        .flatten();
    
    let is_target_admin: Option<bool> = conn
        .exec_first("SELECT is_admin FROM users WHERE id = ?", (&user_id,))
        .ok()
        .flatten();
    
    if is_target_admin == Some(true) && admin_count == Some(1) {
        return DeleteUserResponse {
            success: false,
            message: "不能删除最后一个管理员".to_string(),
        };
    }
    
    // 执行删除
    let result = conn.exec_drop("DELETE FROM users WHERE id = ?", (&user_id,));
    
    match result {
        Ok(_) => {
            println!("[Auth] 用户 {} 删除成功", user_id);
            DeleteUserResponse {
                success: true,
                message: "用户删除成功".to_string(),
            }
        }
        Err(e) => {
            println!("[Auth] 用户 {} 删除失败: {}", user_id, e);
            DeleteUserResponse {
                success: false,
                message: format!("删除失败: {}", e),
            }
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ForceLogoutResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn tauri_force_logout(account: String, instance_id: String) -> ForceLogoutResponse {
    println!("[Auth] 强制退出登录: {} (实例: {})", account, instance_id);

    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] 数据库连接失败: {}", e);
            return ForceLogoutResponse {
                success: false,
                message: e,
            };
        }
    };

    if let Err(_) = ensure_sessions_table(&mut conn) {}

    let user_id: Option<u32> = conn
        .exec_first("SELECT id FROM users WHERE account = ?", (&account,))
        .ok()
        .flatten();

    match user_id {
        Some(uid) => {
            let _ = conn.exec_drop(
                "DELETE FROM user_sessions WHERE user_id = ? AND instance_id = ?",
                (&uid, &instance_id)
            );
            
            let new_online_count = get_online_count(&mut conn, uid);
            let _ = conn.exec_drop(
                "UPDATE users SET online_count = ? WHERE id = ?",
                (&new_online_count, &uid)
            );
            
            println!("[Auth] 强制退出登录成功: {} (剩余在线: {})", account, new_online_count);
            ForceLogoutResponse {
                success: true,
                message: format!("强制退出成功，剩余在线: {}", new_online_count),
            }
        }
        None => {
            println!("[Auth] 强制退出登录: 用户 {} 不存在", account);
            ForceLogoutResponse {
                success: false,
                message: "用户不存在".to_string(),
            }
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ResetOnlineCountResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn tauri_reset_online_count(user_id: u32) -> ResetOnlineCountResponse {
    println!("[Auth] 重置用户在线数: {}", user_id);

    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] 数据库连接失败: {}", e);
            return ResetOnlineCountResponse {
                success: false,
                message: e,
            };
        }
    };

    if let Err(_) = ensure_sessions_table(&mut conn) {}

    let exists: Option<i32> = conn
        .exec_first("SELECT id FROM users WHERE id = ?", (&user_id,))
        .ok()
        .flatten();

    if exists.is_none() {
        return ResetOnlineCountResponse {
            success: false,
            message: "用户不存在".to_string(),
        };
    }

    let _ = conn.exec_drop(
        "DELETE FROM user_sessions WHERE user_id = ?",
        (&user_id,)
    );

    let _ = conn.exec_drop(
        "UPDATE users SET online_count = 0 WHERE id = ?",
        (&user_id,)
    );

    println!("[Auth] 用户 {} 在线数已重置为0", user_id);
    ResetOnlineCountResponse {
        success: true,
        message: "在线数已重置为0".to_string(),
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
    println!("[Auth] 恢复会话: {} (实例: {})", account, instance_id);

    let mut conn = match get_conn() {
        Ok(c) => c,
        Err(e) => {
            println!("[Auth] 数据库连接失败: {}", e);
            return RestoreSessionResponse {
                success: false,
                message: e,
                user: None,
            };
        }
    };

    if let Err(e) = ensure_sessions_table(&mut conn) {
        println!("[Auth] {}", e);
    }

    let result: Option<(u32, String, String, String, String, i32, i32, Option<NaiveDate>, bool)> = conn
        .exec_first(
            "SELECT id, nickname, email, company, department, remaining_days, login_limit, last_deducted_date, is_admin FROM users WHERE account = ?",
            (&account,)
        )
        .ok()
        .flatten();

    match result {
        Some((id, nickname, email, company, department, mut remaining_days, login_limit, last_deducted_date, is_admin)) => {
            let today = Utc::now().date_naive();
            let today_str = today.format("%Y-%m-%d").to_string();

            if let Some(last_date) = last_deducted_date {
                if last_date < today {
                    let days_to_deduct = (today - last_date).num_days() as i32;
                    if days_to_deduct > 0 {
                        remaining_days = (remaining_days - days_to_deduct).max(0);
                        let _ = conn.exec_drop(
                            "UPDATE users SET remaining_days = ?, last_deducted_date = ? WHERE id = ?",
                            (&remaining_days, &today_str, &id)
                        );
                    }
                }
            } else {
                let _ = conn.exec_drop(
                    "UPDATE users SET last_deducted_date = ? WHERE id = ?",
                    (&today_str, &id)
                );
            }

            let online_count = get_online_count(&mut conn, id);

            if online_count >= login_limit {
                let existing_instance: Option<String> = conn
                    .exec_first(
                        "SELECT session_token FROM user_sessions WHERE user_id = ? AND instance_id = ?",
                        (&id, &instance_id)
                    )
                    .ok()
                    .flatten();

                if existing_instance.is_none() {
                    println!("[Auth] 恢复会话: {} 已达登录上限({}/{})，且非已有实例", account, online_count, login_limit);
                    return RestoreSessionResponse {
                        success: false,
                        message: format!("已达登录上限({}/{})", online_count, login_limit),
                        user: None,
                    };
                }
            }

            let session_token = generate_session_token();
            let _ = conn.exec_drop(
                "INSERT INTO user_sessions (user_id, instance_id, session_token) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE session_token = ?",
                (&id, &instance_id, &session_token, &session_token)
            );

            let new_online_count = get_online_count(&mut conn, id);
            let _ = conn.exec_drop(
                "UPDATE users SET online_count = ? WHERE id = ?",
                (&new_online_count, &id)
            );

            println!("[Auth] 恢复会话成功: {} (在线 {}/{})", account, new_online_count, login_limit);

            RestoreSessionResponse {
                success: true,
                message: "会话恢复成功".to_string(),
                user: Some(User {
                    id,
                    nickname,
                    account,
                    email,
                    company,
                    department,
                    remaining_days,
                    login_limit,
                    online_count: new_online_count,
                    is_admin,
                    password_hash: None,
                }),
            }
        }
        None => {
            println!("[Auth] 恢复会话: 用户 {} 不存在", account);
            RestoreSessionResponse {
                success: false,
                message: "用户不存在".to_string(),
                user: None,
            }
        }
    }
}
