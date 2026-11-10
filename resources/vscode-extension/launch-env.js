/*
 * 作者: Harley-xk
 * 创建: 2026-11-10
 *
 * 描述: 为 VSCode 扩展启动 MarkIt 构造隔离后的子进程环境
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

function createLaunchEnvironment(environment) {
  const launchEnvironment = { ...environment }
  delete launchEnvironment.ELECTRON_RUN_AS_NODE
  return launchEnvironment
}

module.exports = { createLaunchEnvironment }
