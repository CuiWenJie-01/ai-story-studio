use serde::{Deserialize, Serialize};
use sha2::Digest;
use base64::{Engine as _, engine::general_purpose};

#[derive(Debug, Serialize, Deserialize)]
pub struct TosUploadResponse {
    pub success: bool,
    pub url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TosListObjectsResponse {
    pub success: bool,
    pub objects: Option<Vec<TosObject>>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TosObject {
    pub key: String,
    pub last_modified: String,
    pub size: u64,
}

fn uri_encode(input: &str, is_object_key: bool) -> String {
    let mut result = String::new();
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b'/' if is_object_key => {
                // 对象名中的 / 不需要编码
                result.push('/');
            }
            b' ' => {
                result.push_str("%20");
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

// 简化版签名函数，只使用 host 和 date（与 API 文档示例一致）
fn build_simple_tos_signature(
    access_key: &str,
    secret_key: &str,
    method: &str,
    bucket: &str,
    region: &str,
    object_key: &str,
    date_short: &str,
    date_long: &str,
    tos_endpoint: Option<&str>,
    s3_endpoint: Option<&str>,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let service = "tos";
    let host = if let Some(ep) = s3_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else if let Some(ep) = tos_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else {
        format!("{}.tos-{}.volces.com", bucket, region)
    };

    // 对 object_key 进行 URI 编码
    let canonical_uri = if object_key.starts_with('/') {
        uri_encode(object_key, true)
    } else {
        format!("/{}", uri_encode(object_key, true))
    };

    // 简化的 canonical headers：只包含 host
    let canonical_headers = format!("host:{}\n", host);
    let signed_headers = "host";

    // 使用 UNSIGNED-PAYLOAD（与预签名 URL 一致）
    let canonical_request = format!(
        "{}\n{}\n\n{}\n{}\nUNSIGNED-PAYLOAD",
        method,
        canonical_uri,
        canonical_headers,
        signed_headers,
    );

    let credential_scope = format!("{}/{}/{}/request", date_short, region, service);

    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_long,
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
        mac.update(region.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_service = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_region).unwrap();
        mac.update(service.as_bytes());
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
        "TOS4-HMAC-SHA256 Credential={}/{},SignedHeaders={},Signature={}",
        access_key, credential_scope, signed_headers, signature
    )
}

fn build_tos_signature(
    access_key: &str,
    secret_key: &str,
    method: &str,
    bucket: &str,
    region: &str,
    object_key: &str,
    content_type: &str,
    content_sha256: &str,
    date_short: &str,
    date_long: &str,
    acl: Option<&str>,
    tos_endpoint: Option<&str>,
    s3_endpoint: Option<&str>,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let service = "tos";
    // 根据 endpoint 配置构建 host
    let host = if let Some(ep) = s3_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else if let Some(ep) = tos_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else {
        format!("{}.tos-{}.volces.com", bucket, region)
    };

    // 对 object_key 进行 URI 编码（对象名中的 / 不编码）
    let canonical_uri = if object_key.starts_with('/') {
        uri_encode(object_key, true)
    } else {
        format!("/{}", uri_encode(object_key, true))
    };

    let canonical_headers = if let Some(acl_value) = acl {
        format!(
            "content-type:{}\nhost:{}\nx-tos-acl:{}\nx-tos-content-sha256:{}\nx-tos-date:{}\n",
            content_type, host, acl_value, content_sha256, date_long
        )
    } else {
        format!(
            "content-type:{}\nhost:{}\nx-tos-content-sha256:{}\nx-tos-date:{}\n",
            content_type, host, content_sha256, date_long
        )
    };

    let signed_headers = if acl.is_some() {
        "content-type;host;x-tos-acl;x-tos-content-sha256;x-tos-date"
    } else {
        "content-type;host;x-tos-content-sha256;x-tos-date"
    };

    let canonical_request = format!(
        "{}\n{}\n\n{}\n{}\n{}",
        method,
        canonical_uri,
        canonical_headers,
        signed_headers,
        content_sha256
    );

    let credential_scope = format!("{}/{}/{}/request", date_short, region, service);

    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_long,
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
        mac.update(region.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_service = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_region).unwrap();
        mac.update(service.as_bytes());
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
        "TOS4-HMAC-SHA256 Credential={}/{},SignedHeaders={},Signature={}",
        access_key, credential_scope, signed_headers, signature
    )
}

// AWS Signature Version 4 for S3 compatible mode
fn build_aws_signature_v4(
    access_key: &str,
    secret_key: &str,
    method: &str,
    bucket: &str,
    region: &str,
    object_key: &str,
    content_type: &str,
    content_sha256: &str,
    date_short: &str,
    date_long: &str,
    s3_endpoint: Option<&str>,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let service = "s3";
    let host = if let Some(ep) = s3_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else {
        format!("{}.s3.{}.amazonaws.com", bucket, region)
    };

    // 对 object_key 进行 URI 编码
    let canonical_uri = if object_key.starts_with('/') {
        uri_encode(object_key, true)
    } else {
        format!("/{}", uri_encode(object_key, true))
    };

    // AWS S3 使用 x-amz-content-sha256 和 x-amz-date
    let canonical_headers = format!(
        "content-type:{}
host:{}
x-amz-content-sha256:{}
x-amz-date:{}
",
        content_type, host, content_sha256, date_long
    );

    let signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date";

    let canonical_request = format!(
        "{}
{}

{}
{}
{}",
        method,
        canonical_uri,
        canonical_headers,
        signed_headers,
        content_sha256
    );

    let credential_scope = format!("{}/{}/{}/aws4_request", date_short, region, service);

    let string_to_sign = format!(
        "AWS4-HMAC-SHA256
{}
{}
{}",
        date_long,
        credential_scope,
        {
            let mut hasher = sha2::Sha256::default();
            hasher.update(canonical_request.as_bytes());
            hex::encode(hasher.finalize())
        }
    );

    let k_date = {
        let mut mac = Hmac::<Sha256>::new_from_slice(format!("AWS4{}", secret_key).as_bytes()).unwrap();
        mac.update(date_short.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_region = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_date).unwrap();
        mac.update(region.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_service = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_region).unwrap();
        mac.update(service.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_signing = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_service).unwrap();
        mac.update(b"aws4_request");
        mac.finalize().into_bytes().to_vec()
    };

    let signature = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_signing).unwrap();
        mac.update(string_to_sign.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    };

    format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key, credential_scope, signed_headers, signature
    )
}

// AWS Signature Version 4 for S3 compatible mode (DELETE)
fn build_aws_signature_v4_for_delete(
    access_key: &str,
    secret_key: &str,
    bucket: &str,
    region: &str,
    object_key: &str,
    date_short: &str,
    date_long: &str,
    s3_endpoint: Option<&str>,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let service = "s3";
    let host = if let Some(ep) = s3_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else {
        format!("{}.s3.{}.amazonaws.com", bucket, region)
    };

    let content_sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    // 对 object_key 进行 URI 编码
    let canonical_uri = if object_key.starts_with('/') {
        uri_encode(object_key, true)
    } else {
        format!("/{}", uri_encode(object_key, true))
    };

    // AWS S3 使用 x-amz-content-sha256 和 x-amz-date
    let canonical_headers = format!(
        "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        host, content_sha256, date_long
    );

    let signed_headers = "host;x-amz-content-sha256;x-amz-date";

    let canonical_request = format!(
        "DELETE\n{}\n\n{}\n{}\n{}",
        canonical_uri,
        canonical_headers,
        signed_headers,
        content_sha256
    );

    let credential_scope = format!("{}/{}/{}/aws4_request", date_short, region, service);

    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        date_long,
        credential_scope,
        {
            let mut hasher = sha2::Sha256::default();
            hasher.update(canonical_request.as_bytes());
            hex::encode(hasher.finalize())
        }
    );

    let k_date = {
        let mut mac = Hmac::<Sha256>::new_from_slice(format!("AWS4{}", secret_key).as_bytes()).unwrap();
        mac.update(date_short.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_region = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_date).unwrap();
        mac.update(region.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_service = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_region).unwrap();
        mac.update(service.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_signing = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_service).unwrap();
        mac.update(b"aws4_request");
        mac.finalize().into_bytes().to_vec()
    };

    let signature = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_signing).unwrap();
        mac.update(string_to_sign.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    };

    format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key, credential_scope, signed_headers, signature
    )
}

#[tauri::command]
pub async fn tos_upload_file(
    access_key: String,
    secret_key: String,
    bucket: String,
    region: String,
    object_key: String,
    file_path: String,
    content_type: String,
    acl: Option<String>,
    _tos_endpoint: Option<String>,
    s3_endpoint: Option<String>,
) -> Result<TosUploadResponse, String> {
    use std::fs;
    use chrono::Utc;

    println!("[TOS] 开始上传文件: file_path={}, object_key={}, bucket={}, region={}", file_path, object_key, bucket, region);

    let file_data = match fs::read(&file_path) {
        Ok(data) => {
            println!("[TOS] 读取文件成功: {} 字节", data.len());
            data
        },
        Err(e) => {
            println!("[TOS] 读取文件失败: {}", e);
            return Ok(TosUploadResponse {
                success: false,
                url: None,
                error: Some(format!("读取文件失败: {}", e)),
            });
        }
    };

    let content_sha256 = {
        let mut hasher = sha2::Sha256::default();
        hasher.update(&file_data);
        hex::encode(hasher.finalize())
    };

    let now = Utc::now();
    let date_long = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_short = now.format("%Y%m%d").to_string();

    let host = if let Some(ref endpoint) = s3_endpoint {
        format!("{}.{}", bucket, endpoint.replace("https://", ""))
    } else {
        format!("{}.tos-{}.volces.com", bucket, region)
    };
    let url = format!("https://{}/{}", host, object_key);
    
    println!("[TOS] 上传URL: {}, host: {}", url, host);

    let client = reqwest::Client::new();
    let mut request = client.put(&url);

    let is_public_bucket = access_key.is_empty() || secret_key.is_empty();

    if is_public_bucket {
        request = request
            .header("Host", &host)
            .header("Content-Type", &content_type)
            .header("Content-Length", file_data.len());
    } else if s3_endpoint.is_some() {
        // 使用 S3 兼容模式 (AWS Signature Version 4)
        println!("[TOS] 使用 AWS Signature Version 4 (S3兼容模式)");
        let authorization = build_aws_signature_v4(
            &access_key,
            &secret_key,
            "PUT",
            &bucket,
            &region,
            &object_key,
            &content_type,
            &content_sha256,
            &date_short,
            &date_long,
            s3_endpoint.as_deref(),
        );

        request = request
            .header("Host", &host)
            .header("Content-Type", &content_type)
            .header("Content-Length", file_data.len())
            .header("X-Amz-Date", &date_long)
            .header("X-Amz-Content-SHA256", &content_sha256)
            .header("Authorization", authorization);
    } else {
        // 使用 TOS 原生模式
        println!("[TOS] 使用 TOS4-HMAC-SHA256 签名");
        let authorization = build_tos_signature(
            &access_key,
            &secret_key,
            "PUT",
            &bucket,
            &region,
            &object_key,
            &content_type,
            &content_sha256,
            &date_short,
            &date_long,
            None,  // 不传 ACL，简化签名
            _tos_endpoint.as_deref(),
            s3_endpoint.as_deref(),
        );

        request = request
            .header("Host", &host)
            .header("Content-Type", &content_type)
            .header("Content-Length", file_data.len())
            .header("X-Tos-Date", &date_long)
            .header("X-Tos-Content-Sha256", &content_sha256)
            .header("Authorization", authorization);
    }

    let request = request.body(file_data);

    let response = request
        .send()
        .await
        .map_err(|e| format!("上传请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        println!("[TOS] 上传失败: status={}, body={}", status, body);
        return Ok(TosUploadResponse {
            success: false,
            url: None,
            error: Some(format!("上传失败: {} - {}", status, body)),
        });
    }
    
    println!("[TOS] 上传成功: {}", url);

    Ok(TosUploadResponse {
        success: true,
        url: Some(url),
        error: None,
    })
}

// 简化版 TOS4-HMAC-SHA256 签名（只用 host 和 date）
fn build_tos_signature_v4_simple(
    access_key: &str,
    secret_key: &str,
    method: &str,
    bucket: &str,
    region: &str,
    object_key: &str,
    date_short: &str,
    date_long: &str,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let service = "tos";
    let host = format!("{}.tos-{}.volces.com", bucket, region);

    // 包含 host 和 x-tos-date 的 canonical headers
    let canonical_headers = format!("host:{}\nx-tos-date:{}\n", host, date_long);
    let signed_headers = "host;x-tos-date";

    // 对 object_key 进行 URI 编码
    let canonical_uri = if object_key.starts_with('/') {
        uri_encode(object_key, true)
    } else {
        format!("/{}", uri_encode(object_key, true))
    };

    // 使用 UNSIGNED-PAYLOAD
    let canonical_request = format!(
        "{}\n{}\n\n{}\n{}\nUNSIGNED-PAYLOAD",
        method,
        canonical_uri,
        canonical_headers,
        signed_headers,
    );

    let credential_scope = format!("{}/{}/{}/request", date_short, region, service);

    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_long,
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
        mac.update(region.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_service = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_region).unwrap();
        mac.update(service.as_bytes());
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
        "TOS4-HMAC-SHA256 Credential={}/{},SignedHeaders={},Signature={}",
        access_key, credential_scope, signed_headers, signature
    )
}

#[tauri::command]
pub async fn tos_upload_base64(
    access_key: String,
    secret_key: String,
    bucket: String,
    region: String,
    object_key: String,
    base64_data: String,
    _content_type: String,
    _acl: Option<String>,
    _tos_endpoint: Option<String>,
    _s3_endpoint: Option<String>,
) -> Result<TosUploadResponse, String> {
    use chrono::Utc;

    // 解码 base64 数据
    let file_data = match general_purpose::STANDARD.decode(&base64_data) {
        Ok(data) => data,
        Err(e) => {
            return Ok(TosUploadResponse {
                success: false,
                url: None,
                error: Some(format!("Base64解码失败: {}", e)),
            });
        }
    };

    // 使用 TOS 日期格式
    let now = Utc::now();
    let date_long = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_short = now.format("%Y%m%d").to_string();

    let host = format!("{}.tos-{}.volces.com", bucket, region);
    let url = format!("https://{}/{}", host, object_key);

    let client = reqwest::Client::new();
    let mut request = client.put(&url);

    let is_public_bucket = access_key.is_empty() || secret_key.is_empty();

    // 计算 content_sha256
    let content_sha256 = {
        let mut hasher = sha2::Sha256::default();
        hasher.update(&file_data);
        hex::encode(hasher.finalize())
    };

    if is_public_bucket {
        request = request
            .header("Host", &host)
            .header("Content-Type", "text/plain")
            .header("X-Tos-Date", &date_long)
            .header("X-Tos-Content-Sha256", &content_sha256)
            .header("Content-Length", file_data.len());
    } else {
        let authorization = build_tos_signature(
            &access_key,
            &secret_key,
            "PUT",
            &bucket,
            &region,
            &object_key,
            "text/plain",
            &content_sha256,
            &date_short,
            &date_long,
            None,  // 不传 ACL
            None,  // 不传 tos_endpoint
            None,  // 不传 s3_endpoint
        );

        request = request
            .header("Host", &host)
            .header("Content-Type", "text/plain")
            .header("X-Tos-Date", &date_long)
            .header("X-Tos-Content-Sha256", &content_sha256)
            .header("Content-Length", file_data.len())
            .header("Authorization", authorization);
    }

    let request = request.body(file_data);

    let response = request
        .send()
        .await
        .map_err(|e| format!("上传请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Ok(TosUploadResponse {
            success: false,
            url: None,
            error: Some(format!("上传失败: {} - {}", status, body)),
        });
    }

    Ok(TosUploadResponse {
        success: true,
        url: Some(url),
        error: None,
    })
}

#[tauri::command]
pub async fn tos_list_objects(
    bucket: String,
    region: String,
    prefix: String,
    tos_endpoint: Option<String>,
    s3_endpoint: Option<String>,
) -> Result<TosListObjectsResponse, String> {
    let host = if let Some(ref ep) = tos_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else if let Some(ref ep) = s3_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else {
        format!("{}.tos-{}.volces.com", bucket, region)
    };

    let url = format!("https://{}/?list-type=2&prefix={}", host, prefix);

    println!("[TOS] 列出对象请求: {}", url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let response = client
        .get(&url)
        .header("Host", &host)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    println!("[TOS] 响应状态: {}", status);

    if !status.is_success() {
        println!("[TOS] 列出失败: {} - {}", status, body);
        return Ok(TosListObjectsResponse {
            success: false,
            objects: None,
            error: Some(format!("列出对象失败: {} - {}", status, body)),
        });
    }

    println!("[TOS] XML响应长度: {}", body.len());
    println!("[TOS] XML响应内容: {}", body);

    let mut objects = Vec::new();

    if body.contains("\"Contents\"") && body.starts_with("{") {
        println!("[TOS] 检测到 JSON 格式响应");
        let contents_match = regex::Regex::new(r#""Key":"([^"]+)","LastModified":"([^"]+)","ETag":".*?","Size":(\d+),"#).unwrap();

        for cap in contents_match.captures_iter(&body) {
            let key = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let last_modified = cap.get(2).map(|m| m.as_str()).unwrap_or("");
            let size_str = cap.get(3).map(|m| m.as_str()).unwrap_or("0");

            if let Ok(size) = size_str.parse::<u64>() {
                objects.push(TosObject {
                    key: key.to_string(),
                    last_modified: last_modified.to_string(),
                    size,
                });
            }
        }
    } else {
        let contents_match = regex::Regex::new(r#"<Contents>[\s\S]*?<Key>([^<]*)</Key>[\s\S]*?<LastModified>([^<]*)</LastModified>[\s\S]*?<Size>(\d*)</Size>[\s\S]*?</Contents>"#).unwrap();

        for cap in contents_match.captures_iter(&body) {
            let key = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let last_modified = cap.get(2).map(|m| m.as_str()).unwrap_or("");
            let size_str = cap.get(3).map(|m| m.as_str()).unwrap_or("0");

            if let Ok(size) = size_str.parse::<u64>() {
                objects.push(TosObject {
                    key: key.to_string(),
                    last_modified: last_modified.to_string(),
                    size,
                });
            }
        }
    }

    println!("[TOS] 解析到 {} 个对象", objects.len());
    Ok(TosListObjectsResponse {
        success: true,
        objects: Some(objects),
        error: None,
    })
}

#[derive(Debug, Serialize)]
pub struct TosDeleteResponse {
    pub success: bool,
    pub error: Option<String>,
}

fn build_tos_signature_for_delete(
    access_key: &str,
    secret_key: &str,
    bucket: &str,
    region: &str,
    object_key: &str,
    date_short: &str,
    date_long: &str,
    tos_endpoint: Option<&str>,
    s3_endpoint: Option<&str>,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let service = "tos";
    // 根据 endpoint 配置构建 host
    let host = if let Some(ep) = s3_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else if let Some(ep) = tos_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else {
        format!("{}.tos-{}.volces.com", bucket, region)
    };
    let content_type = "application/octet-stream";
    let content_sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    // 对 object_key 进行 URI 编码（对象名中的 / 不编码）
    let canonical_uri = if object_key.starts_with('/') {
        uri_encode(object_key, true)
    } else {
        format!("/{}", uri_encode(object_key, true))
    };

    let canonical_headers = format!(
        "content-type:{}\nhost:{}\nx-tos-content-sha256:{}\nx-tos-date:{}\n",
        content_type, host, content_sha256, date_long
    );

    let signed_headers = "content-type;host;x-tos-content-sha256;x-tos-date";

    let canonical_request = format!(
        "DELETE\n{}\n\n{}\n{}\n{}",
        canonical_uri,
        canonical_headers,
        signed_headers,
        content_sha256
    );

    let credential_scope = format!("{}/{}/{}/request", date_short, region, service);

    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_long,
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
        mac.update(region.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_service = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_region).unwrap();
        mac.update(service.as_bytes());
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
        "TOS4-HMAC-SHA256 Credential={}/{},SignedHeaders={},Signature={}",
        access_key, credential_scope, signed_headers, signature
    )
}

#[tauri::command]
pub async fn tos_delete_object(
    access_key: String,
    secret_key: String,
    bucket: String,
    region: String,
    object_key: String,
    tos_endpoint: Option<String>,
    s3_endpoint: Option<String>,
) -> Result<TosDeleteResponse, String> {
    use chrono::Utc;

    println!("[TOS] 删除对象: {}", object_key);

    let now = Utc::now();
    let date_long = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_short = now.format("%Y%m%d").to_string();

    let host = if let Some(ref endpoint) = s3_endpoint {
        format!("{}.{}", bucket, endpoint.replace("https://", ""))
    } else if let Some(ref endpoint) = tos_endpoint {
        format!("{}.{}", bucket, endpoint.replace("https://", ""))
    } else {
        format!("{}.tos-{}.volces.com", bucket, region)
    };
    let url = format!("https://{}/{}", host, object_key);

    let client = reqwest::Client::new();
    let mut request = client.delete(&url);

    let is_public_bucket = access_key.is_empty() || secret_key.is_empty();

    if !is_public_bucket {
        if s3_endpoint.is_some() {
            // 使用 S3 兼容模式 (AWS Signature Version 4)
            println!("[TOS] 使用 AWS Signature Version 4 (S3兼容模式) 删除");
            let authorization = build_aws_signature_v4_for_delete(
                &access_key,
                &secret_key,
                &bucket,
                &region,
                &object_key,
                &date_short,
                &date_long,
                s3_endpoint.as_deref(),
            );

            request = request
                .header("Host", &host)
                .header("X-Amz-Date", &date_long)
                .header("X-Amz-Content-SHA256", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                .header("Authorization", authorization);
        } else {
            // 使用 TOS 原生模式
            println!("[TOS] 使用 TOS4-HMAC-SHA256 签名删除");
            let authorization = build_tos_signature_for_delete(
                &access_key,
                &secret_key,
                &bucket,
                &region,
                &object_key,
                &date_short,
                &date_long,
                tos_endpoint.as_deref(),
                s3_endpoint.as_deref(),
            );

            request = request
                .header("Host", &host)
                .header("Content-Type", "application/octet-stream")
                .header("X-Tos-Date", &date_long)
                .header("X-Tos-Content-Sha256", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                .header("Authorization", authorization);
        }
    } else {
        request = request.header("Host", &host);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("删除请求失败: {}", e))?;

    let status = response.status();
    
    if status.is_success() || status.as_u16() == 204 {
        println!("[TOS] 删除成功: {}", object_key);
        Ok(TosDeleteResponse {
            success: true,
            error: None,
        })
    } else {
        let body = response.text().await.unwrap_or_default();
        let err = format!("删除失败: {} - {}", status, body);
        println!("[TOS] {}", err);
        Ok(TosDeleteResponse {
            success: false,
            error: Some(err),
        })
    }
}

#[derive(Debug, Serialize)]
pub struct PresignedUrlResponse {
    pub success: bool,
    pub url: Option<String>,
    pub error: Option<String>,
}

fn build_presigned_url(
    access_key: &str,
    secret_key: &str,
    bucket: &str,
    region: &str,
    object_key: &str,
    expires_in: u64,
    tos_endpoint: Option<&str>,
    s3_endpoint: Option<&str>,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use chrono::Utc;

    let service = "tos";
    let now = Utc::now();
    let date_short = now.format("%Y%m%d").to_string();
    let date_long = now.format("%Y%m%dT%H%M%SZ").to_string();

    let host = if let Some(ep) = s3_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else if let Some(ep) = tos_endpoint {
        format!("{}.{}", bucket, ep.replace("https://", ""))
    } else {
        format!("{}.tos-{}.volces.com", bucket, region)
    };

    // 构建查询参数
    let credential = format!("{}/{}/{}/{}/request", access_key, date_short, region, service);
    let encoded_credential = urlencoding::encode(&credential);
    
    // 对 object_key 进行 URI 编码
    let encoded_object_key = uri_encode(object_key, true);

    // 构建待签名字符串
    let canonical_request = format!(
        "GET\n/{}\nX-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential={}&X-Tos-Date={}&X-Tos-Expires={}&X-Tos-SignedHeaders=host\nhost:{}\n\nhost\nUNSIGNED-PAYLOAD",
        encoded_object_key,
        encoded_credential,
        date_long,
        expires_in,
        host
    );

    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_long,
        credential,
        {
            let mut hasher = sha2::Sha256::default();
            hasher.update(canonical_request.as_bytes());
            hex::encode(hasher.finalize())
        }
    );

    // 计算签名
    let k_date = {
        let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_bytes()).unwrap();
        mac.update(date_short.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_region = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_date).unwrap();
        mac.update(region.as_bytes());
        mac.finalize().into_bytes().to_vec()
    };

    let k_service = {
        let mut mac = Hmac::<Sha256>::new_from_slice(&k_region).unwrap();
        mac.update(service.as_bytes());
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

    // 构建完整的预签名 URL
    format!(
        "https://{}/{}?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential={}&X-Tos-Date={}&X-Tos-Expires={}&X-Tos-SignedHeaders=host&X-Tos-Signature={}",
        host,
        encoded_object_key,
        encoded_credential,
        date_long,
        expires_in,
        signature
    )
}

#[tauri::command]
pub async fn tos_generate_presigned_url(
    access_key: String,
    secret_key: String,
    bucket: String,
    region: String,
    object_key: String,
    expires_in: Option<u64>,
    tos_endpoint: Option<String>,
    s3_endpoint: Option<String>,
) -> Result<PresignedUrlResponse, String> {
    if access_key.is_empty() || secret_key.is_empty() {
        return Ok(PresignedUrlResponse {
            success: false,
            url: None,
            error: Some("AccessKey 和 SecretKey 不能为空".to_string()),
        });
    }

    let expires = expires_in.unwrap_or(3600); // 默认1小时
    
    let url = build_presigned_url(
        &access_key,
        &secret_key,
        &bucket,
        &region,
        &object_key,
        expires,
        tos_endpoint.as_deref(),
        s3_endpoint.as_deref(),
    );

    Ok(PresignedUrlResponse {
        success: true,
        url: Some(url),
        error: None,
    })
}