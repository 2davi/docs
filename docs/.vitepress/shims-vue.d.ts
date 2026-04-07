// .vue 파일을 TypeScript 모듈로 인식시키는 타입 선언
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
