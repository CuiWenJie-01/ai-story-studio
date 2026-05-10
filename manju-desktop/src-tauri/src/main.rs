#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_title("漫剧生成器 - manju desktop").unwrap();

            // 启动内嵌的 Node.js 后端服务
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                start_embedded_server(&app_handle);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn start_embedded_server(app: &tauri::AppHandle) {
    // 获取应用资源目录
    let resource_dir = app.path().resource_dir().unwrap_or_default();
    
    // 尝试多种方式找到 node 和后端脚本
    let possible_node_paths = vec![
        resource_dir.join("node.exe"),
        resource_dir.join("bin").join("node.exe"),
        std::path::PathBuf::from("node.exe"),
        std::path::PathBuf::from("node"),
    ];

    let server_script = resource_dir.join("server.js");
    
    // 检查后端脚本是否存在
    if !server_script.exists() {
        eprintln!("[Manju Server] server.js not found at: {:?}", server_script);
        return;
    }

    // 找到可用的 node 可执行文件
    let node_path = possible_node_paths.iter()
        .find(|p| p.exists())
        .cloned()
        .or_else(|| {
            // 尝试从 PATH 中找到 node
            which::which("node.exe").ok()
                .or_else(|| which::which("node").ok())
        });

    let node = match node_path {
        Some(p) => p,
        None => {
            eprintln!("[Manju Server] Node.js not found. Please install Node.js.");
            return;
        }
    };

    println!("[Manju Server] Starting embedded server...");
    println!("[Manju Server] Node: {:?}", node);
    println!("[Manju Server] Script: {:?}", server_script);

    let mut child = match Command::new(&node)
        .arg(&server_script)
        .env("MANJU_EMBEDDED", "1")
        .env("MANJU_DATA_DIR", app.path().app_data_dir().unwrap_or_default())
        .spawn() 
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[Manju Server] Failed to start server: {}", e);
            return;
        }
    };

    // 等待子进程结束
    let status = child.wait();
    println!("[Manju Server] Server exited with: {:?}", status);
}
