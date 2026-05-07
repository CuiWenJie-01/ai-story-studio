# coding:utf-8
import requests
import os
import sys
import json

def download_video(url, save_path):
    print(f"[Python] 开始下载视频: {url[:100]}...")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
    
    try:
        response = requests.get(url, headers=headers, stream=True, timeout=300)
        print(f"[Python] 响应状态: {response.status_code}")
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        print(f"[Python] 文件大小: {total_size / 1024 / 1024:.2f} MB")
        
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        
        downloaded = 0
        with open(save_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"\r[Python] 下载进度: {percent:.1f}%", end='', flush=True)
        
        print(f"\n[Python] 下载完成! 文件保存至: {save_path}")
        
        return {
            "success": True,
            "path": save_path,
            "size": downloaded
        }
        
    except Exception as e:
        print(f"[Python] 下载失败: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "参数不足，需要 url 和 save_path"}))
        sys.exit(1)
    
    video_url = sys.argv[1]
    save_path = sys.argv[2]
    
    result = download_video(video_url, save_path)
    print(json.dumps(result))
