declare module 'eruda' {
  interface Eruda {
    init(): void;
    destroy(): void;
  }
  const eruda: Eruda;
  export default eruda;
}
