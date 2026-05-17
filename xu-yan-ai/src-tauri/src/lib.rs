mod jimeng;
mod tos;
mod minimax_tts;

use tauri::Emitter;
mod frame_extractor;
mod auth_service;
mod changelog_service;
mod cloud_asset;
mod email_service;

use std::fs;
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
struct RenameResult {
    success: bool,
    error: Option<String>,
}

#[tauri::command]
fn tauri_rename_project_folder(old_path: String, new_path: String) -> RenameResult {
    println!("[tauri_rename_project_folder] 重命名文件夹: {} -> {}", old_path, new_path);
    
    match fs::rename(&old_path, &new_path) {
        Ok(_) => {
            println!("[tauri_rename_project_folder] 重命名成功");
            RenameResult {
                success: true,
                error: None,
            }
        }
        Err(e) => {
            let error_msg = format!("重命名失败: {}", e);
            println!("[tauri_rename_project_folder] {}", error_msg);
            RenameResult {
                success: false,
                error: Some(error_msg),
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobileEntryPoint)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            println!("[旭言AI] 应用启动中...");
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
            )?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_fs::init())?;
            app.handle().plugin(tauri_plugin_shell::init())?;
            app.handle().plugin(tauri_plugin_http::init())?;
            println!("[旭言AI] 插件加载完成");

            // Check command line args for folder path (right-click open)
            let args: Vec<String> = std::env::args().collect();
            println!("[旭言AI] 启动参数: {:?}", args);
            
            if args.len() > 1 {
                let folder_path = args[1].clone();
                let path = std::path::Path::new(&folder_path);
                if path.is_dir() {
                    println!("[旭言AI] 检测到文件夹参数: {}", folder_path);
                    let app_handle = app.handle().clone();
                    // Delay emit to ensure frontend is ready
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(1500));
                        app_handle.emit("open-project-folder", &folder_path).ok();
                        println!("[旭言AI] 已发送打开项目事件: {}", folder_path);
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            jimeng::jimeng_detect_subjects,
            jimeng::jimeng_submit_task,
            jimeng::jimeng_query_task,
            jimeng::download_video_to_folder,
            minimax_tts::minimax_text_to_speech,
            minimax_tts::get_minimax_voices,
            frame_extractor::extract_last_frame,
            frame_extractor::extract_frame_at_time,
            auth_service::tauri_login,
            auth_service::tauri_register,
            auth_service::tauri_logout,
            auth_service::tauri_change_password,
            auth_service::tauri_get_user_info,
            auth_service::tauri_refresh_user_info,
            auth_service::tauri_verify_credentials,
            auth_service::tauri_check_network,
            auth_service::tauri_quick_check_connection,
            auth_service::tauri_verify_user_status,
            auth_service::tauri_get_all_users,
            auth_service::tauri_update_user,
            auth_service::tauri_delete_user,
            auth_service::tauri_get_user_email,
            auth_service::tauri_force_logout,
            auth_service::tauri_reset_online_count,
            auth_service::tauri_restore_session,
            email_service::tauri_send_email_code,
            email_service::tauri_verify_email_code,
            changelog_service::tauri_get_changelogs,
            changelog_service::tauri_add_changelog,
            changelog_service::tauri_delete_changelog,
            changelog_service::tauri_check_is_admin,
            cloud_asset::cloud_asset_save_library,
            cloud_asset::cloud_asset_list_libraries,
            cloud_asset::cloud_asset_delete_library,
            cloud_asset::cloud_asset_download,
            cloud_asset::download_file,
            tos::tos_upload_file,
            tos::tos_upload_base64,
            tos::tos_list_objects,
            tos::tos_delete_object,
            tauri_rename_project_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}