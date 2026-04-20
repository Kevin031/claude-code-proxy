#!/usr/bin/env node
/**
 * 图标转换脚本 - 将 SVG 转换为 Electron 应用所需的各种格式
 * 使用: node scripts/convert-icon.js
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const projectDir = path.dirname(__dirname);
const iconsDir = path.join(projectDir, 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

// 动态导入 ES 模块
let sharp, pngToIco;
async function loadDeps() {
  sharp = (await import('sharp')).default;
  pngToIco = (await import('png-to-ico')).default;
}

// 需要生成的尺寸
const sizes = [16, 32, 64, 128, 256, 512, 1024];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function convertSvgToPng(svgPath, size, outputPath) {
  await sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(outputPath);

  console.log(`生成: ${outputPath}`);
}

async function createIcns(iconsetPath, outputPath) {
  execSync(`iconutil -c icns ${iconsetPath} -o ${outputPath}`, { stdio: 'inherit' });
  console.log(`生成: ${outputPath}`);
}

async function createIco(pngFiles, outputPath) {
  // ICO 需要特定尺寸
  const icoSizes = [16, 32, 256];
  const buffers = [];

  for (const size of icoSizes) {
    const pngPath = pngFiles[size];
    if (pngPath) {
      const buffer = await fs.readFile(pngPath);
      buffers.push(buffer);
    }
  }

  // 使用 png-to-ico 创建 ICO
  const icoBuffer = await pngToIco(buffers);
  await fs.writeFile(outputPath, icoBuffer);

  console.log(`生成: ${outputPath}`);
}

async function main() {
  console.log('开始转换图标...\n');

  // 加载依赖
  await loadDeps();

  // 检查 SVG 是否存在
  try {
    await fs.access(svgPath);
  } catch {
    console.error(`错误: 找不到 ${svgPath}`);
    process.exit(1);
  }

  // 生成各种尺寸的 PNG
  console.log('生成 PNG 文件...');
  const pngFiles = {};
  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon_${size}x${size}.png`);
    await convertSvgToPng(svgPath, size, outputPath);
    pngFiles[size] = outputPath;
  }

  // 创建 macOS iconset
  console.log('\n创建 macOS iconset...');
  const iconsetPath = path.join(iconsDir, 'icon.iconset');
  await ensureDir(iconsetPath);

  const mappings = {
    16: ['icon_16x16.png'],
    32: ['icon_16x16@2x.png', 'icon_32x32.png'],
    64: ['icon_32x32@2x.png'],
    128: ['icon_128x128.png'],
    256: ['icon_128x128@2x.png', 'icon_256x256.png'],
    512: ['icon_256x256@2x.png', 'icon_512x512.png'],
    1024: ['icon_512x512@2x.png'],
  };

  for (const [size, filenames] of Object.entries(mappings)) {
    for (const filename of filenames) {
      const dest = path.join(iconsetPath, filename);
      try {
        await fs.access(dest);
      } catch {
        await fs.copyFile(pngFiles[size], dest);
      }
    }
  }

  // 生成 .icns
  console.log('\n生成 .icns 文件...');
  const icnsPath = path.join(iconsDir, 'icon.icns');
  await createIcns(iconsetPath, icnsPath);

  // 生成 .ico
  console.log('\n生成 .ico 文件...');
  const icoPath = path.join(iconsDir, 'icon.ico');
  await createIco(pngFiles, icoPath);

  // 复制 SVG 到 Web 目录
  console.log('\n复制到 Web 目录...');
  const webDir = path.join(projectDir, 'web', 'claude-proxy-web', 'public');
  try {
    await fs.copyFile(svgPath, path.join(webDir, 'favicon.svg'));
    await fs.copyFile(svgPath, path.join(webDir, 'icons.svg'));
    console.log('已更新 Web 图标');
  } catch (err) {
    console.log('跳过 Web 图标更新:', err.message);
  }

  // 更新 package.json
  console.log('\n更新 package.json...');
  try {
    const packagePath = path.join(projectDir, 'package.json');
    const config = JSON.parse(await fs.readFile(packagePath, 'utf-8'));

    if (!config.build) config.build = {};
    config.build.icon = 'icons/icon.icns';

    if (!config.build.win) config.build.win = {};
    config.build.win.icon = 'icons/icon.ico';

    if (!config.build.linux) config.build.linux = {};
    config.build.linux.icon = 'icons/icon_512x512.png';

    await fs.writeFile(packagePath, JSON.stringify(config, null, 2) + '\n');
    console.log('已更新 package.json 配置');
  } catch (err) {
    console.log('跳过 package.json 更新:', err.message);
  }

  console.log('\n转换完成!');
  console.log(`- PNG 文件: ${iconsDir}`);
  console.log(`- macOS: ${icnsPath}`);
  console.log(`- Windows: ${icoPath}`);
  console.log(`- Linux: ${pngFiles[512]}`);
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
