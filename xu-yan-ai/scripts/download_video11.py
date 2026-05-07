# coding:utf-8
import requests
import os

def download_video(url, save_path):
    print(f"开始下载视频: {url}")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    response = requests.get(url, headers=headers, stream=True)
    response.raise_for_status()
    
    total_size = int(response.headers.get('content-length', 0))
    print(f"文件大小: {total_size / 1024 / 1024:.2f} MB")
    
    downloaded = 0
    with open(save_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    print(f"\r下载进度: {percent:.1f}%", end='')
    
    print(f"\n下载完成! 文件保存至: {save_path}")
    return save_path

if __name__ == "__main__":
    video_url = "https://v11-aiop.aigc-cloud.com/6046ff3fe4866b5a2190356398ac7af6/69c0b06b/video/tos/cn/tos-cn-v-242bcc/cefc252ac0e8434aab897c9a95c2ca7b/?a=764792&ch=0&cr=0&dr=0&er=0&lr=default&cd=0%7C0%7C0%7C0&br=3923&bt=3923&cs=0&ds=3&ft=GbtG6uO3pyygZmo0PlCCqRkVQ9w6x&mime_type=video_mp4&qs=13&rc=M2lsaWVrb3BkOjgzNGczM0BpM2lsaWVrb3BkOjgzNGczM0BwYXNzcWdeMS1hLS1kXjBzYSNwYXNzcWdeMS1hLS1kXjBzcw%3D%3D&btag=c0000e00008000&dy_q=1774232154&l=202603231015541AC6689A4796EB936EA0"
    save_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloaded_video.mp4")
    
    download_video(video_url, save_file)
