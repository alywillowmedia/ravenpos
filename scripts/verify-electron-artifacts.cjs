const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const distDir = path.join(projectRoot, 'electron-dist');
const latestYmlPath = path.join(distDir, 'latest.yml');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function bytesToMiB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function ensure(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${label}: ${path.relative(projectRoot, filePath)}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

const { version } = readJson(packageJsonPath);
const installerName = `RavenPOS-Setup-${version}-x64.exe`;
const portableName = `RavenPOS-Portable-${version}-x64.exe`;
const installerPath = path.join(distDir, installerName);
const portablePath = path.join(distDir, portableName);

console.log(`Verifying Windows artifacts for version ${version}...`);

if (!ensure(installerPath, 'installer')) {
  process.exit(1);
}
if (!ensure(portablePath, 'portable')) {
  process.exit(1);
}

const installerStat = fs.statSync(installerPath);
const portableStat = fs.statSync(portablePath);

console.log(`Installer: ${installerName}`);
console.log(`  Size: ${bytesToMiB(installerStat.size)} MiB`);
console.log(`  SHA256: ${sha256(installerPath)}`);

console.log(`Portable: ${portableName}`);
console.log(`  Size: ${bytesToMiB(portableStat.size)} MiB`);
console.log(`  SHA256: ${sha256(portablePath)}`);

if (fs.existsSync(latestYmlPath)) {
  const latestYml = fs.readFileSync(latestYmlPath, 'utf8');
  if (!latestYml.includes(`version: ${version}`)) {
    console.error('latest.yml version does not match package.json version');
    process.exit(1);
  }
  if (!latestYml.includes(installerName)) {
    console.error(`latest.yml does not reference ${installerName}`);
    process.exit(1);
  }
  console.log('latest.yml check passed');
} else {
  console.log('No latest.yml found (this is expected when only building portable)');
}

console.log('Windows artifact verification passed');
