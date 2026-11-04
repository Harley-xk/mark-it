/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // Vue 官方推荐的单文件组件 shim，保留 {} / any 以匹配 DefineComponent 的默认泛型
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.css?raw' {
  const content: string
  export default content
}
