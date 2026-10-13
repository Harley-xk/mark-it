/**
 * 滚动条状态管理（VS Code 风格）：
 * - 滚动时短暂点亮滚动条（1s 后淡出）
 * - 鼠标悬停在滚动区域时点亮
 * - 通过 sb-active / sb-scrolling 类应用到滚动容器上（配合 App.vue 全局样式）
 *
 * 悬停不用 CSS :hover：Electron 中鼠标移入标题栏拖拽区
 * (-webkit-app-region: drag) 后渲染进程不再收到鼠标事件，
 * :hover 状态会卡住不消失。这里用三层机制保证状态可靠：
 * 1. mousemove 事件驱动 —— 进入/移动时立即点亮（响应快）
 * 2. 主进程每 300ms 推送真实光标位置 —— 地面真值，可自愈一切卡住状态
 * 3. 窗口失焦 / 鼠标离开窗口时清除
 */

const ACTIVE_CLASS = 'sb-active'
const SCROLLING_CLASS = 'sb-scrolling'
const SCROLL_FADE_MS = 1000

let installed = false
let activeEl: HTMLElement | null = null
const fadeTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  while (el && el !== document.documentElement) {
    const style = window.getComputedStyle(el)
    const scrollable = /(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflowX)
    if (scrollable && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
      return el
    }
    el = el.parentElement
  }
  return null
}

function setActive(el: HTMLElement | null): void {
  if (activeEl === el) return
  activeEl?.classList.remove(ACTIVE_CLASS)
  activeEl = el
  el?.classList.add(ACTIVE_CLASS)
}

function hitTest(x: number, y: number): void {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  setActive(findScrollContainer(el))
}

function onMouseMove(e: MouseEvent): void {
  hitTest(e.clientX, e.clientY)
}

function onMouseOut(e: MouseEvent): void {
  // relatedTarget 为空表示鼠标已离开窗口
  if (!e.relatedTarget) setActive(null)
}

function onBlur(): void {
  setActive(null)
}

function onScroll(e: Event): void {
  const el = findScrollContainer(e.target as HTMLElement | null)
  if (!el) return
  el.classList.add(SCROLLING_CLASS)
  const prev = fadeTimers.get(el)
  if (prev) clearTimeout(prev)
  fadeTimers.set(
    el,
    setTimeout(() => {
      el.classList.remove(SCROLLING_CLASS)
      fadeTimers.delete(el)
    }, SCROLL_FADE_MS)
  )
}

function onCursorPos(pos: { x: number; y: number }): void {
  if (pos.x < 0 || pos.y < 0 || pos.x > window.innerWidth || pos.y > window.innerHeight) {
    setActive(null)
    return
  }
  hitTest(pos.x, pos.y)
}

export function useScrollbarState(): void {
  // App 级单次安装（HMR 下防止重复注册）
  if (installed) return
  installed = true

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseout', onMouseOut)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('blur', onBlur)
  window.api.onCursorPos(onCursorPos)
}
