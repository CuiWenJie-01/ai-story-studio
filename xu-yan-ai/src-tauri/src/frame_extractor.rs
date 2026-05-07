use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractFrameResult {
    pub success: bool,
    pub image_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub error: Option<String>,
}

fn get_ffmpeg_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let resource_dir = app_handle.path().resource_dir().unwrap_or_else(|_| std::env::current_dir().unwrap());
    
    let bundled_ffmpeg = resource_dir.join("binaries").join("ffmpeg-7.1.1-essentials_build").join("bin").join("ffmpeg.exe");
    
    if bundled_ffmpeg.exists() {
        println!("[FrameExtractor] 使用打包的 ffmpeg: {:?}", bundled_ffmpeg);
        bundled_ffmpeg
    } else {
        let fallback = resource_dir.join("binaries").join("ffmpeg.exe");
        if fallback.exists() {
            println!("[FrameExtractor] 使用打包的 ffmpeg (fallback): {:?}", fallback);
            fallback
        } else {
            println!("[FrameExtractor] 使用系统 ffmpeg");
            std::path::PathBuf::from("ffmpeg")
        }
    }
}

#[tauri::command]
pub async fn extract_last_frame(
    app_handle: tauri::AppHandle,
    video_path: String,
    output_path: String,
    thumbnail_path: String,
) -> ExtractFrameResult {
    println!("[FrameExtractor] 开始抽帧: {} -> {}", video_path, output_path);

    let ffmpeg_path = get_ffmpeg_path(&app_handle);

    let output = Command::new(&ffmpeg_path)
        .args([
            "-sseof", "-0.1",
            "-i", &video_path,
            "-vframes", "1",
            "-y",
            &output_path,
        ])
        .output();

    match output {
        Ok(result) => {
            if result.status.success() {
                println!("[FrameExtractor] 抽帧成功: {}", output_path);

                let thumb_result = generate_thumbnail(&ffmpeg_path, &output_path, &thumbnail_path);
                
                ExtractFrameResult {
                    success: true,
                    image_path: Some(output_path.clone()),
                    thumbnail_path: if thumb_result { Some(thumbnail_path) } else { None },
                    error: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                println!("[FrameExtractor] 抽帧失败: {}", stderr);
                ExtractFrameResult {
                    success: false,
                    image_path: None,
                    thumbnail_path: None,
                    error: Some(format!("ffmpeg 执行失败: {}", stderr)),
                }
            }
        }
        Err(e) => {
            println!("[FrameExtractor] 执行 ffmpeg 失败: {}", e);
            ExtractFrameResult {
                success: false,
                image_path: None,
                thumbnail_path: None,
                error: Some(format!("执行 ffmpeg 失败: {}", e)),
            }
        }
    }
}

#[tauri::command]
pub async fn extract_frame_at_time(
    app_handle: tauri::AppHandle,
    video_path: String,
    output_path: String,
    thumbnail_path: String,
    time_seconds: f64,
) -> ExtractFrameResult {
    println!("[FrameExtractor] 开始抽帧 (时间点 {}s): {} -> {}", time_seconds, video_path, output_path);

    let ffmpeg_path = get_ffmpeg_path(&app_handle);
    let time_str = format!("{:.2}", time_seconds);

    let output = Command::new(&ffmpeg_path)
        .args([
            "-ss", &time_str,
            "-i", &video_path,
            "-vframes", "1",
            "-y",
            &output_path,
        ])
        .output();

    match output {
        Ok(result) => {
            if result.status.success() {
                println!("[FrameExtractor] 抽帧成功: {}", output_path);

                let thumb_result = generate_thumbnail(&ffmpeg_path, &output_path, &thumbnail_path);
                
                ExtractFrameResult {
                    success: true,
                    image_path: Some(output_path.clone()),
                    thumbnail_path: if thumb_result { Some(thumbnail_path) } else { None },
                    error: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                println!("[FrameExtractor] 抽帧失败: {}", stderr);
                ExtractFrameResult {
                    success: false,
                    image_path: None,
                    thumbnail_path: None,
                    error: Some(format!("ffmpeg 执行失败: {}", stderr)),
                }
            }
        }
        Err(e) => {
            println!("[FrameExtractor] 执行 ffmpeg 失败: {}", e);
            ExtractFrameResult {
                success: false,
                image_path: None,
                thumbnail_path: None,
                error: Some(format!("执行 ffmpeg 失败: {}", e)),
            }
        }
    }
}

fn generate_thumbnail(ffmpeg_path: &std::path::Path, image_path: &str, thumbnail_path: &str) -> bool {
    println!("[FrameExtractor] 生成缩略图: {} -> {}", image_path, thumbnail_path);

    let output = Command::new(ffmpeg_path)
        .args([
            "-i", image_path,
            "-vf", "scale=320:-1",
            "-y",
            thumbnail_path,
        ])
        .output();

    match output {
        Ok(result) => {
            if result.status.success() {
                println!("[FrameExtractor] 缩略图生成成功");
                true
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                println!("[FrameExtractor] 缩略图生成失败: {}", stderr);
                false
            }
        }
        Err(e) => {
            println!("[FrameExtractor] 生成缩略图失败: {}", e);
            false
        }
    }
}
