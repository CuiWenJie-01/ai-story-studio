use serde::{Deserialize, Serialize};
use sha2::Digest;

#[derive(Debug, Serialize, Deserialize)]
pub struct JimengDetectResponse {
    pub success: bool,
    pub has_subject: Option<bool>,
    pub mask_urls: Option<Vec<String>>,
    pub mask_images: Option<Vec<String>>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JimengGenerateResponse {
    pub success: bool,
    pub task_id: Option<String>,
    pub video_url: Option<String>,
    pub status: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JimengTaskStatusResponse {
    pub success: bool,
    pub status: Option<String>,
    pub video_url: Option<String>,
    pub error: Option<String>,
}

fn build_signature(
    access_key: &str,
    secret_key: &str,
    method: &str,
    path: &str,
    query: &str,
    body: &str,
    date: &str,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let body_hash = {
        let mut hasher = sha2::Sha256::default();
        hasher.update(body.as_bytes());
        hex::encode(hasher.finalize())
    };

    let canonical_request = format!(
        "{}\n{}\n{}\nhost:visual.volcengineapi.com\nx-date:{}\n\nhost;x-date\n{}",
        method,
        path,
        query,
        date,
        body_hash
    );

    let date_short = &date[0..8];
    let credential_scope = format!("{}/cn-north-1/cv/request", date_short);
    
    let string_to_sign = format!(
        "HMAC-SHA256\n{}\n{}\n{}",
        date,
        credential_scope,
        {
            let mut hasher = sha2::Sha256::default();
            hasher.update(canonical_request.as_bytes());
            hex::encode(hasher.finalize())
        }
    );

    let k_date = {
        let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_bytes()).unwrap();
        mac.update(date_short.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };
    
    let k_region = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_date).unwrap();
        mac.update(b"cn-north-1");
        mac.finalize().into_bytes().to_vec()
    };
    
    let k_service = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_region).unwrap();
        mac.update(b"cv");
        mac.finalize().into_bytes().to_vec()
    };
    
    let k_signing = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_service).unwrap();
        mac.update(b"request");
        mac.finalize().into_bytes().to_vec()
    };

    let signature = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_signing).unwrap();
        mac.update(string_to_sign.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    };

    format!(
        "HMAC-SHA256 Credential={}/{}, SignedHeaders=host;x-date, Signature={}",
        access_key, credential_scope, signature
    )
}

fn is_valid_public_url(url: &str) -> bool {
    if url.starts_with("http://asset.localhost") 
        || url.starts_with("https://asset.localhost")
        || url.starts_with("http://localhost")
        || url.starts_with("https://localhost")
        || url.starts_with("file://")
        || url.starts_with("asset://") {
        return false;
    }
    url.starts_with("http://") || url.starts_with("https://")
}

#[tauri::command]
pub async fn jimeng_detect_subjects(
    access_key: String,
    secret_key: String,
    image_url: String,
    task_folder: Option<String>,
) -> Result<JimengDetectResponse, String> {
    use chrono::Utc;

    if !is_valid_public_url(&image_url) {
        return Ok(JimengDetectResponse {
            success: false,
            has_subject: None,
            mask_urls: None,
            mask_images: None,
            error: Some("图片URL必须是公网可访问的地址，不支持本地文件。请先上传图片到图床或云存储".to_string()),
        });
    }

    let client = reqwest::Client::new();
    
    let body = serde_json::json!({
        "req_key": "jimeng_realman_avatar_object_detection",
        "image_url": image_url,
    });
    let body_str = body.to_string();

    let path = "/";
    let query = "Action=CVProcess&Version=2022-08-31";
    let now = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let authorization = build_signature(&access_key, &secret_key, "POST", path, query, &body_str, &now);

    let response = client
        .post("https://visual.volcengineapi.com/?Action=CVProcess&Version=2022-08-31")
        .header("Content-Type", "application/json")
        .header("Host", "visual.volcengineapi.com")
        .header("Authorization", authorization)
        .header("X-Date", &now)
        .body(body_str)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let response_text = response.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
    
    println!("[Jimeng] 主体检测响应状态: {}", status);
    println!("[Jimeng] 主体检测响应内容: {}", response_text);

    let result: serde_json::Value = match serde_json::from_str(&response_text) {
        Ok(v) => v,
        Err(e) => {
            return Ok(JimengDetectResponse {
                success: false,
                has_subject: None,
                mask_urls: None,
                mask_images: None,
                error: Some(format!("解析响应失败: {} - 响应内容: {}", e, response_text)),
            });
        }
    };

    let code = result["code"].as_i64();
    let message = result["message"].as_str().unwrap_or("未知错误");
    
    println!("[Jimeng] 响应码: {:?}, 消息: {}", code, message);

    if code != Some(10000) {
        let error_code = code.unwrap_or(0);
        let error_detail = if let Some(data) = result.get("data") {
            format!("API错误(code={}): {} - {}", error_code, message, data)
        } else {
            format!("API错误(code={}): {}", error_code, message)
        };
        return Ok(JimengDetectResponse {
            success: false,
            has_subject: None,
            mask_urls: None,
            mask_images: None,
            error: Some(error_detail),
        });
    }

    let resp_data_str = result["data"]["resp_data"].as_str().unwrap_or("{}");
    let resp_data: serde_json::Value = serde_json::from_str(resp_data_str).unwrap_or(serde_json::json!({}));

    let has_subject = resp_data["status"].as_i64() == Some(1);
    let mask_urls: Option<Vec<String>> = resp_data["object_detection_result"]["mask"]["url"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect());

    let mask_images = if let (Some(urls), Some(folder)) = (&mask_urls, &task_folder) {
        let mut local_paths = Vec::new();
        
        let character_dir = std::path::Path::new(folder).join("Character image");
        if let Err(e) = std::fs::create_dir_all(&character_dir) {
            println!("[Jimeng] 创建目录失败: {}", e);
        } else {
            for (i, url) in urls.iter().enumerate() {
                match client.get(url).send().await {
                    Ok(resp) => {
                        if resp.status().is_success() {
                            match resp.bytes().await {
                                Ok(bytes) => {
                                    let filename = format!("mask_{}.png", i + 1);
                                    let filepath = character_dir.join(&filename);
                                    match std::fs::write(&filepath, &bytes) {
                                        Ok(_) => {
                                            println!("[Jimeng] 保存mask图片: {:?}", filepath);
                                            local_paths.push(filepath.to_string_lossy().to_string());
                                        }
                                        Err(e) => println!("[Jimeng] 保存文件失败: {}", e),
                                    }
                                }
                                Err(e) => println!("[Jimeng] 读取响应失败: {}", e),
                            }
                        } else {
                            println!("[Jimeng] 下载mask失败: {}", resp.status());
                        }
                    }
                    Err(e) => println!("[Jimeng] 请求失败: {}", e),
                }
            }
        }
        Some(local_paths)
    } else {
        None
    };

    Ok(JimengDetectResponse {
        success: true,
        has_subject: Some(has_subject),
        mask_urls,
        mask_images,
        error: None,
    })
}

#[tauri::command]
pub async fn jimeng_submit_task(
    access_key: String,
    secret_key: String,
    image_url: String,
    audio_url: String,
    mask_urls: Option<Vec<String>>,
    prompt: Option<String>,
    resolution: Option<i32>,
    fast_mode: Option<bool>,
) -> Result<JimengGenerateResponse, String> {
    use chrono::Utc;

    if !is_valid_public_url(&image_url) {
        return Ok(JimengGenerateResponse {
            success: false,
            task_id: None,
            video_url: None,
            status: None,
            error: Some("图片URL必须是公网可访问的地址，不支持本地文件。请先上传图片到图床或云存储".to_string()),
        });
    }

    if !is_valid_public_url(&audio_url) {
        return Ok(JimengGenerateResponse {
            success: false,
            task_id: None,
            video_url: None,
            status: None,
            error: Some("音频URL必须是公网可访问的地址，不支持本地文件。请先上传音频到图床或云存储".to_string()),
        });
    }

    let client = reqwest::Client::new();

    let mut body = serde_json::json!({
        "req_key": "jimeng_realman_avatar_picture_omni_v15",
        "image_url": image_url,
        "audio_url": audio_url,
    });

    if let Some(urls) = mask_urls {
        body["mask_url"] = serde_json::json!(urls);
    }
    if let Some(p) = prompt {
        body["prompt"] = serde_json::json!(p);
    }
    if let Some(r) = resolution {
        body["output_resolution"] = serde_json::json!(r);
    }
    if let Some(f) = fast_mode {
        body["pe_fast_mode"] = serde_json::json!(f);
    }

    let body_str = body.to_string();

    let path = "/";
    let query = "Action=CVSubmitTask&Version=2022-08-31";
    let now = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let authorization = build_signature(&access_key, &secret_key, "POST", path, query, &body_str, &now);

    let response = client
        .post("https://visual.volcengineapi.com/?Action=CVSubmitTask&Version=2022-08-31")
        .header("Content-Type", "application/json")
        .header("Host", "visual.volcengineapi.com")
        .header("Authorization", authorization)
        .header("X-Date", &now)
        .body(body_str)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let response_text = response.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
    
    println!("[Jimeng] 提交任务响应状态: {}", status);
    println!("[Jimeng] 提交任务响应内容: {}", response_text);

    let result: serde_json::Value = serde_json::from_str(&response_text).map_err(|e| format!("解析响应失败: {}", e))?;

    if result["code"].as_i64() != Some(10000) {
        return Ok(JimengGenerateResponse {
            success: false,
            task_id: None,
            video_url: None,
            status: None,
            error: Some(result["message"].as_str().unwrap_or("未知错误").to_string()),
        });
    }

    Ok(JimengGenerateResponse {
        success: true,
        task_id: result["data"]["task_id"].as_str().map(|s| s.to_string()),
        video_url: None,
        status: Some("submitted".to_string()),
        error: None,
    })
}

#[tauri::command]
pub async fn jimeng_query_task(
    access_key: String,
    secret_key: String,
    task_id: String,
) -> Result<JimengTaskStatusResponse, String> {
    use chrono::Utc;

    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "req_key": "jimeng_realman_avatar_picture_omni_v15",
        "task_id": task_id,
    });
    let body_str = body.to_string();

    let path = "/";
    let query = "Action=CVGetResult&Version=2022-08-31";
    let now = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let authorization = build_signature(&access_key, &secret_key, "POST", path, query, &body_str, &now);

    let response = client
        .post("https://visual.volcengineapi.com/?Action=CVGetResult&Version=2022-08-31")
        .header("Content-Type", "application/json")
        .header("Host", "visual.volcengineapi.com")
        .header("Authorization", authorization)
        .header("X-Date", &now)
        .body(body_str)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let result: serde_json::Value = response.json().await.map_err(|e| format!("解析响应失败: {}", e))?;

    if result["code"].as_i64() != Some(10000) {
        return Ok(JimengTaskStatusResponse {
            success: false,
            status: None,
            video_url: None,
            error: Some(result["message"].as_str().unwrap_or("未知错误").to_string()),
        });
    }

    let status = result["data"]["status"].as_str().unwrap_or("").to_string();
    let video_url = result["data"]["video_url"].as_str().map(|s| s.to_string());

    Ok(JimengTaskStatusResponse {
        success: true,
        status: Some(status),
        video_url,
        error: None,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadVideoResponse {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn download_video_to_folder(
    video_url: String,
    task_folder: String,
    shot_number: i32,
    cookie: Option<String>,
) -> Result<DownloadVideoResponse, String> {
    use std::process::Command;
    
    println!("[Jimeng] 开始下载视频: {}", video_url);

    let video_dir = std::path::Path::new(&task_folder).join("Video");
    if let Err(e) = std::fs::create_dir_all(&video_dir) {
        return Ok(DownloadVideoResponse {
            success: false,
            path: None,
            error: Some(format!("创建目录失败: {}", e)),
        });
    }

    // 扫描已有文件确定下一个序号
    let mut next_seq = 1;
    if let Ok(entries) = std::fs::read_dir(&video_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                let pattern = format!("镜头{}_Video_(\\d+).mp4", shot_number);
                if let Some(captures) = regex::Regex::new(&pattern).ok().and_then(|re| re.captures(name)) {
                    if let Some(seq_str) = captures.get(1) {
                        if let Ok(seq) = seq_str.as_str().parse::<i32>() {
                            if seq >= next_seq {
                                next_seq = seq + 1;
                            }
                        }
                    }
                }
            }
        }
    }

    let filename = format!("镜头{}_Video_{}.mp4", shot_number, next_seq);
    let filepath = video_dir.join(&filename);
    let filepath_str = filepath.to_string_lossy().to_string();

    // 方案1: 使用 reqwest 下载（只带 User-Agent）
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("创建客户端失败: {}", e))?;

    println!("[Jimeng] 尝试下载视频...");
  
    let response = client.get(&video_url).send().await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(bytes) = resp.bytes().await {
                if bytes.len() > 10000 {
                    if let Ok(_) = std::fs::write(&filepath, &bytes) {
                        println!("[Jimeng] 视频保存成功: {:?}", filepath);
                        return Ok(DownloadVideoResponse {
                            success: true,
                            path: Some(filepath_str),
                            error: None,
                        });
                    }
                }
            }
        }
        _ => {
            println!("[Jimeng] reqwest 下载失败");
        }
    }

    // 方案2: 使用 curl 命令（只带 User-Agent）
    println!("[Jimeng] 尝试 curl 下载...");
    let curl_args = vec![
        "-L".to_string(),
        "-o".to_string(),
        filepath_str.clone(),
        "-H".to_string(),
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string(),
        video_url.clone(),
    ];
      
    let curl_result = Command::new("curl")
        .args(&curl_args)
        .output();

    if let Ok(output) = curl_result {
        if output.status.success() && filepath.exists() {
            if let Ok(metadata) = std::fs::metadata(&filepath) {
                if metadata.len() > 10000 {
                    println!("[Jimeng] curl 下载成功: {:?}", filepath);
                    return Ok(DownloadVideoResponse {
                        success: true,
                        path: Some(filepath_str),
                        error: None,
                    });
                }
            }
        }
    }

    // 方案3: 使用 Python 脚本下载
    println!("[Jimeng] 尝试 Python 下载...");
    
    let exe_dir = std::env::current_exe()
        .map(|p| p.parent().map(|pp| pp.to_path_buf()).unwrap_or_default())
        .unwrap_or_default();
    
    let cwd = std::env::current_dir().unwrap_or_default();
    
    let python_script_paths = vec![
        cwd.join("scripts").join("download_video.py"),
        exe_dir.join("scripts").join("download_video.py"),
        std::path::Path::new("scripts/download_video.py").to_path_buf(),
        std::path::Path::new("../scripts/download_video.py").to_path_buf(),
        std::path::Path::new("../../scripts/download_video.py").to_path_buf(),
    ];
    
    println!("[Jimeng] 搜索 Python 脚本路径...");
    for p in &python_script_paths {
        println!("[Jimeng] 检查路径: {:?}", p);
    }
    
    let mut script_path: Option<std::path::PathBuf> = None;
    for path in python_script_paths {
        if path.exists() {
            println!("[Jimeng] 找到脚本: {:?}", path);
            script_path = Some(path);
            break;
        }
    }
    
    if script_path.is_none() {
        println!("[Jimeng] 未找到 Python 脚本，跳过 Python 下载");
    }
    
    if let Some(script) = script_path {
        let python_commands = vec!["python", "python3", "py"];
        
        for python_cmd in python_commands {
            println!("[Jimeng] 尝试使用 {} 执行脚本", python_cmd);
            
            let result = Command::new(python_cmd)
                .arg(&script)
                .arg(&video_url)
                .arg(&filepath_str)
                .output();
            
            match &result {
                Ok(output) => {
                    println!("[Jimeng] Python stdout: {}", String::from_utf8_lossy(&output.stdout));
                    if !output.stderr.is_empty() {
                        println!("[Jimeng] Python stderr: {}", String::from_utf8_lossy(&output.stderr));
                    }
                }
                Err(e) => {
                    println!("[Jimeng] Python 命令执行失败: {} - {}", python_cmd, e);
                    continue;
                }
            }
            
            if let Ok(output) = result {
                if output.status.success() && filepath.exists() {
                    if let Ok(metadata) = std::fs::metadata(&filepath) {
                        if metadata.len() > 10000 {
                            println!("[Jimeng] Python 下载成功: {:?}", filepath);
                            return Ok(DownloadVideoResponse {
                                success: true,
                                path: Some(filepath_str),
                                error: None,
                            });
                        } else {
                            println!("[Jimeng] Python 下载文件过小: {} bytes", metadata.len());
                        }
                    }
                }
            }
        }
    }
    
    // 方案3.5: 使用内联 Python 代码下载
    println!("[Jimeng] 尝试内联 Python 代码下载...");
    
    // 使用 base64 编码 Cookie 避免特殊字符问题
    let cookie_base64 = if let Some(ref cookie_str) = cookie {
        if !cookie_str.is_empty() {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(cookie_str.as_bytes())
        } else {
            String::new()
        }
    } else {
        String::new()
    };
    
    let inline_python_code = r#"
import requests
import sys
import os
import base64

url = sys.argv[1]
save_path = sys.argv[2]
cookie_b64 = sys.argv[3] if len(sys.argv) > 3 else ""

# 简单的 headers，不设置 Referer（避免触发防盗链）
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

if cookie_b64:
    try:
        cookie = base64.b64decode(cookie_b64).decode('utf-8')
        headers['Cookie'] = cookie
        print(f"[Python] Cookie 已设置, 长度: {len(cookie)}")
    except Exception as e:
        print(f"[Python] Cookie 解码失败: {e}")

try:
    print(f"[Python] 开始下载: {url[:100]}...")
    response = requests.get(url, headers=headers, stream=True, timeout=300)
    print(f"[Python] 响应状态: {response.status_code}")
    response.raise_for_status()
    
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    
    total = 0
    with open(save_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
                total += len(chunk)
    
    print(f"SUCCESS: {save_path} ({total} bytes)")
except Exception as e:
    print(f"ERROR: {e}")
"#;

    let python_commands = vec!["python", "python3", "py"];
    
    for python_cmd in python_commands {
        let result = Command::new(python_cmd)
            .arg("-c")
            .arg(inline_python_code)
            .arg(&video_url)
            .arg(&filepath_str)
            .arg(&cookie_base64)
            .output();
        
        match &result {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("[Jimeng] 内联Python stdout: {}", stdout);
                if !stderr.is_empty() {
                    println!("[Jimeng] 内联Python stderr: {}", stderr);
                }
                
                if stdout.contains("SUCCESS") && filepath.exists() {
                    if let Ok(metadata) = std::fs::metadata(&filepath) {
                        if metadata.len() > 10000 {
                            println!("[Jimeng] 内联Python 下载成功: {:?}", filepath);
                            return Ok(DownloadVideoResponse {
                                success: true,
                                path: Some(filepath_str),
                                error: None,
                            });
                        }
                    }
                }
            }
            Err(e) => {
                println!("[Jimeng] 内联Python 命令执行失败: {} - {}", python_cmd, e);
            }
        }
    }

    // 方案4: 打开浏览器让用户手动保存
    println!("[Jimeng] 打开浏览器让用户手动保存...");
    let _ = open::that(&video_url);
    
    Ok(DownloadVideoResponse {
        success: false,
        path: None,
        error: Some("视频链接有防盗链保护，已在浏览器中打开，请手动保存视频".to_string()),
    })
}
