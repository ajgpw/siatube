<template>
  <footer class="watch-footer" aria-label="サイト情報">
    <nav aria-label="外部リンク">
      <a href="https://github.com/ajgpw/siatube" target="_blank" rel="noopener noreferrer">GitHub</a>
      <a href="https://line.me/ti/g2/PT62G9W_N5WOkD7VECW3tftJlCn2KTJIVt6k7g" target="_blank" rel="noopener noreferrer">LINE</a>
      <a href="https://www.chatwork.com/g/siatube" target="_blank" rel="noopener noreferrer">ChatWork</a>
    </nav>
  </footer>
</template>

<style scoped>
.watch-footer {
  --footer-glass-rgb: 255, 255, 255;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 24px;
  margin: 32px 16px 0;
  padding: 20px 8px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  border: 0;
  box-shadow: none;
  font-size: 13px;
  line-height: 1.6;
}

html.dark-mode .watch-footer { --footer-glass-rgb: 26, 26, 26; }

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .watch-footer {
    background: rgba(var(--footer-glass-rgb), 0.94);
    -webkit-backdrop-filter: blur(12px) saturate(0.65);
    backdrop-filter: blur(12px) saturate(0.65);
  }
}

.watch-footer nav { display: flex; gap: 20px; }
.watch-footer a { color: inherit; text-decoration: none; }
.watch-footer a:hover { color: var(--text-primary); text-decoration: underline; }
.watch-footer a:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
</style>
