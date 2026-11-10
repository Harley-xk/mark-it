/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 校验安装包、运行时与 VSCode 扩展图标均来自同一份 MarkIt 铅笔品牌源
 */
const { createHash } = require('crypto')
const { existsSync, readFileSync } = require('fs')
const { join, relative } = require('path')
const sharp = require('sharp')

const ROOT = join(__dirname, '..')
const SOURCE_ICON = join(ROOT, 'build', 'icon.png')
const RUNTIME_ICONS = [
  join(ROOT, 'resources', 'icon.png'),
  join(ROOT, 'resources', 'vscode-extension', 'icon.png')
]
const BRAND_ICON_CANDIDATES = [
  SOURCE_ICON,
  join(ROOT, 'build', 'icon2.png'),
  join(ROOT, 'build', 'icon-full.png'),
  ...RUNTIME_ICONS
]
const RUNTIME_SIZE = 512
const ELECTRON_ATOM_SHA256 = '4363016ccf3541c84ae6a1eee83f507fb2b775aa89b9d6c8163875640267f9e9'

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

async function readPixels(file, width, height) {
  return sharp(file)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
}

async function main() {
  for (const file of [SOURCE_ICON, ...RUNTIME_ICONS]) {
    if (!existsSync(file)) throw new Error(`缺少品牌图标：${relative(ROOT, file)}`)
  }

  for (const file of BRAND_ICON_CANDIDATES) {
    if (existsSync(file) && sha256(file) === ELECTRON_ATOM_SHA256) {
      throw new Error(`检测到 Electron 原子图标：${relative(ROOT, file)}`)
    }
  }

  const source = await readPixels(SOURCE_ICON, RUNTIME_SIZE, RUNTIME_SIZE)
  for (const file of RUNTIME_ICONS) {
    const metadata = await sharp(file).metadata()
    if (metadata.width !== RUNTIME_SIZE || metadata.height !== RUNTIME_SIZE) {
      throw new Error(
        `${relative(ROOT, file)} 尺寸必须为 ${RUNTIME_SIZE}×${RUNTIME_SIZE}，` +
          `当前为 ${metadata.width}×${metadata.height}`
      )
    }

    const runtime = await readPixels(file, RUNTIME_SIZE, RUNTIME_SIZE)
    if (!source.data.equals(runtime.data)) {
      throw new Error(
        `${relative(ROOT, file)} 与 build/icon.png 不一致，` +
          '请执行 node scripts/pad-icon.cjs 重新同步铅笔品牌图标'
      )
    }
  }

  console.log('✓ 安装包、运行时与 VSCode 扩展图标均使用 MarkIt 铅笔品牌源')
}

main().catch((error) => {
  console.error('Icon verification failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
