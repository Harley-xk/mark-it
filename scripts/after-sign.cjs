// electron-builder afterSign 钩子：修正 Windows 可执行文件的版本信息语言
// electron-builder 沿用 electron.exe 自带的 en-US(0x0409) 版本资源，且没有配置项可以改，
// 这里在资源编辑（写 FileDescription / Copyright 等）完成后，把版本信息整体改为简体中文。
// 注意：本钩子会改写 exe 资源；若将来启用代码签名，需改为签名前的钩子，否则签名会失效。
const fs = require('node:fs/promises')
const path = require('node:path')
const { NtExecutable, NtExecutableResource, Resource } = require('resedit')

// zh-CN, Unicode codepage
const ZH_CN = { lang: 0x0804, codepage: 1200 }

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const { appOutDir, packager } = context
  const exePath = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`)

  const buffer = await fs.readFile(exePath)
  const executable = NtExecutable.from(buffer)
  const resources = NtExecutableResource.from(executable)

  const versionInfo = Resource.VersionInfo.fromEntries(resources.entries)[0]
  if (versionInfo == null) {
    console.warn(`[after-sign] 未找到版本信息资源，跳过: ${exePath}`)
    return
  }

  // 保留 electron-builder 写入的原有字段（版本号等），只迁移语言并覆盖说明/版权
  const oldLanguages = versionInfo.getAllLanguagesForStringValues()
  const values = oldLanguages.length > 0 ? versionInfo.getStringValues(oldLanguages[0]) : {}
  Object.assign(values, {
    FileDescription: 'MarkIt - 轻量 Markdown 编辑器',
    CompanyName: 'witice.top',
    LegalCopyright: 'Copyright © 2026 witice.top',
  })

  for (const language of oldLanguages) {
    versionInfo.removeAllStringValues(language, true)
  }
  versionInfo.setStringValues(ZH_CN, values, true)
  versionInfo.replaceAvailableLanguages([ZH_CN])
  versionInfo.outputToResourceEntries(resources.entries)

  resources.outputResource(executable)
  await fs.writeFile(exePath, Buffer.from(executable.generate()))
  console.log(`[after-sign] 已设置版本信息语言为 zh-CN: ${exePath}`)
}
