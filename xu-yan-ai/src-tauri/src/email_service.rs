use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use lazy_static::lazy_static;
use rand::Rng;
use chrono::Utc;
use lettre::{Message, SmtpTransport, Transport};
use lettre::transport::smtp::authentication::Credentials;

// 验证码缓存（内存存储，生产环境建议用 Redis）
// 格式: email -> (code, expire_time, purpose)
lazy_static! {
    static ref EMAIL_CODES: Mutex<HashMap<String, (String, i64, String)>> = Mutex::new(HashMap::new());
    static ref LAST_SEND_TIME: Mutex<HashMap<String, HashMap<String, i64>>> = Mutex::new(HashMap::new());
}

// QQ邮箱SMTP配置
const SMTP_HOST: &str = "smtp.qq.com";
const SMTP_PORT: u16 = 465;
const SMTP_USERNAME: &str = "1579031899@qq.com";
const SMTP_PASSWORD: &str = "edlnoixasfojjjgf";
const FROM_NAME: &str = "旭言AI";

#[derive(Debug, Serialize)]
pub struct SendEmailCodeResponse {
    pub success: bool,
    pub message: String,
    pub cooldown_seconds: i64,
}

#[derive(Debug, Serialize)]
pub struct VerifyEmailCodeResponse {
    pub success: bool,
    pub message: String,
}

/// 生成6位数字验证码
fn generate_code() -> String {
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| rng.gen_range(0..10).to_string())
        .collect()
}

/// 检查是否可以发送验证码（60秒冷却）
fn can_send_code(key: &str, purpose: &str) -> (bool, i64) {
    let last_send = LAST_SEND_TIME.lock().unwrap();
    
    if let Some(user_times) = last_send.get(key) {
        if let Some(&last_time) = user_times.get(purpose) {
            let now = Utc::now().timestamp();
            let elapsed = now - last_time;
            if elapsed < 60 {
                return (false, 60 - elapsed);
            }
        }
    }
    
    (true, 0)
}

/// 记录发送时间
fn record_send_time(key: &str, purpose: &str) {
    let mut last_send = LAST_SEND_TIME.lock().unwrap();
    let user_times = last_send.entry(key.to_string()).or_insert_with(HashMap::new);
    user_times.insert(purpose.to_string(), Utc::now().timestamp());
}

/// 发送邮件（使用QQ邮箱SMTP）
async fn send_email(to: &str, subject: &str, body: &str) -> Result<(), String> {
    // 构建邮件
    let email = Message::builder()
        .from(format!("{} <{}>", FROM_NAME, SMTP_USERNAME).parse().map_err(|e| format!("发件人格式错误: {}", e))?)
        .to(to.parse().map_err(|e| format!("收件人格式错误: {}", e))?)
        .subject(subject)
        .header(lettre::message::header::ContentType::TEXT_PLAIN)
        .body(body.to_string())
        .map_err(|e| format!("构建邮件失败: {}", e))?;

    // 配置SMTP凭据
    let creds = Credentials::new(SMTP_USERNAME.to_string(), SMTP_PASSWORD.to_string());

    // 创建SMTP传输（使用SSL）
    let mailer = SmtpTransport::relay(SMTP_HOST)
        .map_err(|e| format!("SMTP服务器配置错误: {}", e))?
        .port(SMTP_PORT)
        .credentials(creds)
        .build();

    // 发送邮件
    match mailer.send(&email) {
        Ok(_) => {
            println!("[Email] 邮件发送成功: {}", to);
            Ok(())
        }
        Err(e) => {
            let err_msg = format!("邮件发送失败: {}", e);
            println!("[Email] {}", err_msg);
            Err(err_msg)
        }
    }
}

/// 发送邮箱验证码
#[tauri::command]
pub async fn tauri_send_email_code(
    email: String,
    purpose: String, // "register" 或 "login"
) -> SendEmailCodeResponse {
    println!("[Email] 发送验证码到: {}, 用途: {}", email, purpose);
    
    // 验证邮箱格式
    let email_regex = regex::Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    if !email_regex.is_match(&email) {
        return SendEmailCodeResponse {
            success: false,
            message: "邮箱格式不正确".to_string(),
            cooldown_seconds: 0,
        };
    }
    
    // 检查冷却时间
    let (can_send, cooldown) = can_send_code(&email, &purpose);
    if !can_send {
        return SendEmailCodeResponse {
            success: false,
            message: format!("请等待 {} 秒后再发送", cooldown),
            cooldown_seconds: cooldown,
        };
    }
    
    // 生成验证码
    let code = generate_code();
    
    // 保存验证码（5分钟有效）
    let expire_time = Utc::now().timestamp() + 300;
    {
        let mut codes = EMAIL_CODES.lock().unwrap();
        codes.insert(email.clone(), (code.clone(), expire_time, purpose.clone()));
    }
    
    // 记录发送时间
    record_send_time(&email, &purpose);
    
    // 构建邮件内容
    let subject = if purpose == "register" {
        "【旭言AI】注册验证码"
    } else {
        "【旭言AI】登录验证码"
    };
    
    let body = format!(
        "您好！\n\n您的验证码是：{}\n\n验证码5分钟内有效，请勿泄露给他人。\n\n如非本人操作，请忽略此邮件。\n\n---\n旭言AI团队",
        code
    );
    
    // 发送邮件
    match send_email(&email, subject, &body).await {
        Ok(_) => {
            println!("[Email] 验证码邮件已发送至: {}", email);
            SendEmailCodeResponse {
                success: true,
                message: "验证码已发送至您的邮箱".to_string(),
                cooldown_seconds: 60,
            }
        }
        Err(e) => {
            println!("[Email] 发送失败: {}", e);
            SendEmailCodeResponse {
                success: false,
                message: format!("发送失败: {}", e),
                cooldown_seconds: 0,
            }
        }
    }
}

/// 验证邮箱验证码
#[tauri::command]
pub async fn tauri_verify_email_code(
    email: String,
    code: String,
    purpose: String,
) -> VerifyEmailCodeResponse {
    println!("[Email] 验证验证码: {}, 用途: {}", email, purpose);
    
    let codes = EMAIL_CODES.lock().unwrap();
    
    match codes.get(&email) {
        Some((saved_code, expire_time, saved_purpose)) => {
            // 检查用途是否匹配
            if saved_purpose != &purpose {
                return VerifyEmailCodeResponse {
                    success: false,
                    message: "验证码用途不匹配".to_string(),
                };
            }
            
            // 检查是否过期
            let now = Utc::now().timestamp();
            if now > *expire_time {
                return VerifyEmailCodeResponse {
                    success: false,
                    message: "验证码已过期，请重新获取".to_string(),
                };
            }
            
            // 检查验证码是否正确
            if saved_code != &code {
                return VerifyEmailCodeResponse {
                    success: false,
                    message: "验证码错误".to_string(),
                };
            }
            
            println!("[Email] 验证码验证成功: {}", email);
            VerifyEmailCodeResponse {
                success: true,
                message: "验证成功".to_string(),
            }
        }
        None => VerifyEmailCodeResponse {
            success: false,
            message: "请先获取验证码".to_string(),
        },
    }
}

/// 清除已使用的验证码
pub fn clear_email_code(email: &str) {
    let mut codes = EMAIL_CODES.lock().unwrap();
    codes.remove(email);
}
