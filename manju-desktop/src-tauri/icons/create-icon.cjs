const fs = require('fs');
const path = require('path');

// 创建 32x32 和 128x128 的简单 BMP 格式图标
// 实际上我们需要 PNG，用 sharp 库来生成

const { createCanvas } = require('canvas');

async function createIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // 透明背景
  ctx.clearRect(0, 0, size, size);
  
  // 画紫色渐变圆形
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#6366f1');
  gradient.addColorStop(1, '#8b5cf6');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
  ctx.fill();
  
  // 画 "M" 文字
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', size/2, size/2 + size * 0.05);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created ${outputPath}`);
}

async function main() {
  const sizes = [32, 128, 256, 512];
  for (const size of sizes) {
    await createIcon(size, path.join(__dirname, `${size}x${size}.png`));
  }
  // 创建 icon.ico (复制 256x256)
  fs.copyFileSync(path.join(__dirname, '256x256.png'), path.join(__dirname, 'icon.ico'));
  console.log('Created icon.ico');
}

main().catch(console.error);
