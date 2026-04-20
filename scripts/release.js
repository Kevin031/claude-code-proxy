#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

/**
 * 根据类型递增版本号
 * @param {string} version - 当前版本号
 * @param {string} type - patch | minor | major
 * @returns {string} 新版本号
 */
function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (type === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else {
    parts[2]++;
  }
  return parts.join('.');
}

/**
 * 执行 shell 命令
 */
function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

const type = process.argv[2];
if (!['patch', 'minor', 'major'].includes(type)) {
  console.log('用法: pnpm release <patch|minor|major>');
  console.log(`当前版本: ${pkg.version}`);
  process.exit(1);
}

const newVersion = bumpVersion(pkg.version, type);
const tag = `v${newVersion}`;

console.log(`准备发布: ${pkg.version} -> ${newVersion}`);
console.log(`Tag: ${tag}\n`);

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

run('git add package.json');
run(`git commit -m "release: ${tag}"`);
run(`git tag ${tag}`);
run(`git push origin ${tag}`);

console.log(`\n已推送 tag ${tag}，CI 将自动构建并发布 Release。`);
