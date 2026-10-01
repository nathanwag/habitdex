import { html, setTop, APP_NAME } from '../ui.js';

export async function render(view) {
  setTop({ title: APP_NAME });
  view.innerHTML = html`<p class="muted empty">Nenhum hábito ainda.</p>`;
}
