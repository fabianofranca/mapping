import { dragHasFiles } from './imageIntake';

// Guarda de documento (#972): arquivo solto fora de um alvo que o trate (painéis, tela inicial,
// canvas somente leitura) faria o navegador abrir o arquivo na aba e desmontar a app. Cancelar a
// ação padrão de `dragover` e `drop` com arquivos evita isso; quem trata o `drop` (canvas) segue
// funcionando, porque o guarda não para a propagação. Arrastos internos, sem arquivo, não mudam.

const cancelFileDrag = (e: DragEvent) => {
  if (dragHasFiles(e.dataTransfer)) e.preventDefault();
};

/** Registra o guarda no documento; devolve quem o remove. */
export function installFileDropGuard(doc: Document = document): () => void {
  doc.addEventListener('dragover', cancelFileDrag);
  doc.addEventListener('drop', cancelFileDrag);
  return () => {
    doc.removeEventListener('dragover', cancelFileDrag);
    doc.removeEventListener('drop', cancelFileDrag);
  };
}
