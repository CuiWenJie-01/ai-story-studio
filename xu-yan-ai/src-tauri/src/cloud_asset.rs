use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CloudAssetLibrary {
    pub id: String,
    pub name: String,
    pub account_id: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct ListLibrariesResponse {
    success: bool,
    libraries: Vec<CloudAssetLibrary>,
    error: Option<String>,
}

fn get_library_index_path(app: &AppHandle, account_id: &str) -> PathBuf {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    let cloud_asset_dir = app_data_dir.join("cloud_assets").join(account_id);
    fs::create_dir_all(&cloud_asset_dir).ok();
    cloud_asset_dir.join("libraries.json")
}

#[derive(Debug, Serialize)]
pub struct SaveLibraryResponse {
    success: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DeleteLibraryResponse {
    success: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DownloadResponse {
    success: bool,
    path: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub async fn cloud_asset_save_library(
    app: AppHandle,
    accountId: String,
    libraryJson: String,
) -> Result<SaveLibraryResponse, String> {
    println!("[CloudAsset] 保存资产库: account={}", accountId);

    let index_path = get_library_index_path(&app, &accountId);

    let mut libraries: Vec<CloudAssetLibrary> = if index_path.exists() {
        let content = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    let new_library: CloudAssetLibrary =
        serde_json::from_str(&libraryJson).map_err(|e| e.to_string())?;

    if let Some(existing) = libraries.iter_mut().find(|l| l.id == new_library.id) {
        *existing = new_library;
    } else {
        libraries.push(new_library);
    }

    let json = serde_json::to_string_pretty(&libraries).map_err(|e| e.to_string())?;
    fs::write(&index_path, json).map_err(|e| e.to_string())?;

    println!("[CloudAsset] 资产库保存成功");
    Ok(SaveLibraryResponse {
        success: true,
        error: None,
    })
}

#[tauri::command]
pub async fn cloud_asset_list_libraries(
    _app: AppHandle,
    _accountId: String,
) -> Result<ListLibrariesResponse, String> {
    println!("[CloudAsset] 获取资产库列表从TOS: account={}", _accountId);

    Ok(ListLibrariesResponse {
        success: true,
        libraries: vec![],
        error: None,
    })
}

#[tauri::command]
pub async fn cloud_asset_delete_library(
    app: AppHandle,
    accountId: String,
    libraryId: String,
) -> Result<DeleteLibraryResponse, String> {
    println!(
        "[CloudAsset] 删除资产库: account={}, libraryId={}",
        accountId, libraryId
    );

    let index_path = get_library_index_path(&app, &accountId);

    if !index_path.exists() {
        return Ok(DeleteLibraryResponse {
            success: true,
            error: None,
        });
    }

    let content = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let mut libraries: Vec<CloudAssetLibrary> =
        serde_json::from_str(&content).unwrap_or_default();

    libraries.retain(|l| l.id != libraryId);

    let json = serde_json::to_string_pretty(&libraries).map_err(|e| e.to_string())?;
    fs::write(&index_path, json).map_err(|e| e.to_string())?;

    println!("[CloudAsset] 删除成功");
    Ok(DeleteLibraryResponse {
        success: true,
        error: None,
    })
}

#[tauri::command]
pub async fn cloud_asset_download(
    url: String,
    localPath: String,
) -> Result<DownloadResponse, String> {
    download_file_internal(url, localPath).await
}

#[tauri::command]
pub async fn download_file(
    url: String,
    localPath: String,
) -> Result<DownloadResponse, String> {
    download_file_internal(url, localPath).await
}

async fn download_file_internal(url: String, localPath: String) -> Result<DownloadResponse, String> {
    println!("[CloudAsset] 下载文件: url={}, local={}", url, localPath);

    if let Some(parent) = PathBuf::from(&localPath).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err = format!("HTTP错误: {}", response.status());
        println!("[CloudAsset] 下载失败: {}", err);
        return Ok(DownloadResponse {
            success: false,
            path: None,
            error: Some(err),
        });
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&localPath, bytes).map_err(|e| e.to_string())?;

    println!("[CloudAsset] 下载成功: {}", localPath);
    Ok(DownloadResponse {
        success: true,
        path: Some(localPath),
        error: None,
    })
}
