const fs = require('fs');
const path = require('path');

// 读取 PNG 文件
const pngBuffer = fs.readFileSync(path.join(__dirname, '256x256.png'));

// ICO 文件头
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type: 1 = ICO
header.writeUInt16LE(1, 4); // Count: 1 image

// ICONDIRENTRY
const entry = Buffer.alloc(16);
entry.writeUInt8(256 > 255 ? 0 : 256, 0); // Width (0 means 256)
entry.writeUInt8(256 > 255 ? 0 : 256, 1); // Height (0 means 256)
entry.writeUInt8(0, 2); // Colors (0 = >256)
entry.writeUInt8(0, 3); // Reserved
entry.writeUInt16LE(1, 4); // Color planes
entry.writeUInt16LE(32, 6); // Bits per pixel
entry.writeUInt32LE(pngBuffer.length, 8); // Size of image data
entry.writeUInt32LE(6 + 16, 12); // Offset to image data

// 组合 ICO 文件
const ico = Buffer.concat([header, entry, pngBuffer]);
fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
console.log('Created real icon.ico');
