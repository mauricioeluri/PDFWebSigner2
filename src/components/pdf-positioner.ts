/**
 * Controlador do posicionador.
 *
 * Coordena a tela inicial e o editor: abertura de PDFs locais, seleção única,
 * preferência de última página e cópia das saídas para o pyHanko.
 *
 * A renderização, os gestos e os controles ficam nos módulos vizinhos.
 *
 * @packageDocumentation
 */
import { PdfViewer } from './pdf-positioner/pdf-viewer'
import {
  SignatureSelection,
  type Signature,
} from './pdf-positioner/signature-selection'
import { createToolbar, type CopyFormat } from './pdf-positioner/toolbar'

const MAX_FILE_SIZE = 100 * 1024 * 1024
const root = document.querySelector<HTMLElement>('#pdf-design')!
const start = root.querySelector<HTMLElement>('.start')!
const editor = root.querySelector<HTMLElement>('.editor')!
const filename = root.querySelector<HTMLElement>('.file')!
const openButton = root.querySelector<HTMLButtonElement>('.open')!
const fileInput = root.querySelector<HTMLInputElement>('.file-input')!
const feedback = root.querySelector<HTMLElement>('.feedback')!
const container = root.querySelector<HTMLElement>('.desk')!

// Cada abertura/fechamento invalida leituras assíncronas do arquivo anterior.
let requestId = 0
let opening = false
let pinnedSignature: Signature | null = null

// Os callbacks ligam visualizador e seleção; os tipos explícitos quebram o ciclo de inferência.
const viewer: PdfViewer = new PdfViewer(
  container,
  updateControls,
  showMessage,
  () => selection.editing
)
const selection: SignatureSelection = new SignatureSelection(
  container,
  (number) => viewer.getPage(number),
  selectionChanged
)
const toolbar = createToolbar(root, {
  navigate: (number) => viewer.goTo(number),
  zoom: (value) => viewer.setZoom(value),
  pin: setLastPageOnly,
  copy: (format) => {
    void copySelection(format)
  },
  clear: clearSelection,
  close: () => {
    void closeDocument()
  },
  showSelection: () => {
    if (selection.current) viewer.goTo(selection.current.page)
  },
  message: showMessage,
})
viewer.setZoom(toolbar.zoom)

function showMessage(text: string) {
  feedback.textContent = text
  feedback.hidden = text.length === 0
}

function updateControls() {
  toolbar.update({
    busy: opening || viewer.busy,
    page: viewer.pageNumber,
    pageCount: viewer.pageCount,
    selectionPage: selection.current?.page ?? null,
    effectiveZoom: viewer.effectiveZoom,
  })
}

/** Mantém a área fixada em sincronia sem vincular seleção à página visível. */
function selectionChanged() {
  if (toolbar.lastPageOnly) pinnedSignature = selection.current
  updateControls()
  viewer.refreshVisibility()
}

function showEditor(visible: boolean) {
  start.hidden = visible
  start.classList.remove('is-dragging')
  editor.hidden = !visible
  filename.hidden = !visible
  root.classList.toggle('is-open', visible)
}

/** Fecha o PDF atual, mas preserva a área memorizada para a última página. */
async function closeDocument() {
  ++requestId
  opening = false
  // A preferência fixada sobrevive ao fechamento, mas a seleção do documento não.
  const remembered = pinnedSignature
  selection.clear()
  pinnedSignature = remembered
  showEditor(false)
  filename.textContent = ''
  toolbar.closeMenu()
  openButton.disabled = false
  openButton.focus()
  showMessage('')
  await viewer.close()
}

/** Valida e lê o arquivo local; nenhum dado do PDF sai do navegador. */
async function openDocument(file: File) {
  const request = ++requestId
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    showMessage('Escolha um arquivo PDF.')
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    showMessage('Escolha um PDF de até 100 MB.')
    return
  }
  opening = true
  openButton.disabled = true
  showMessage('Abrindo PDF…')
  updateControls()

  try {
    await viewer.close()
    if (request !== requestId) return
    const data = new Uint8Array(await file.arrayBuffer())
    if (request !== requestId) return
    filename.textContent = file.name
    filename.title = file.name
    showEditor(true)
    await viewer.open(data, toolbar.lastPageOnly)
    if (request !== requestId) return
    showMessage('')
    restorePinnedSignature()
    toolbar.focusClose()
  } catch (error) {
    if (request !== requestId) return
    await viewer.close()
    showEditor(false)
    const passwordProtected =
      error instanceof Error && error.name === 'PasswordException'
    showMessage(
      passwordProtected
        ? 'PDF protegido por senha não é suportado nesta etapa.'
        : 'Não foi possível abrir o PDF. Verifique se o arquivo é válido.'
    )
  } finally {
    if (request === requestId) {
      opening = false
      openButton.disabled = false
      updateControls()
    }
  }
}

/** Reaplica a área somente em uma última página com a mesma geometria. */
function restorePinnedSignature() {
  if (!toolbar.lastPageOnly || !pinnedSignature) return
  const lastPage = viewer.getPage(viewer.pageCount)
  const remembered = pinnedSignature
  if (
    lastPage?.geometry === remembered.geometry &&
    selection.restore(lastPage, remembered.box)
  ) {
    showMessage(
      'Área reaplicada na última página. Confira a posição no documento.'
    )
  } else {
    pinnedSignature = null
    showMessage('A geometria da última página mudou. Marque a área novamente.')
  }
}

function setLastPageOnly(enabled: boolean) {
  if (enabled && selection.current?.page !== viewer.pageCount) selection.clear()
  pinnedSignature = enabled ? selection.current : null
  viewer.setLastPageOnly(enabled)
  updateControls()
}

function clearSelection() {
  selection.clear()
  pinnedSignature = null
  container.focus({ preventScroll: true })
  showMessage('Seleção removida.')
}

/** Copia a posição ou um comando que cria um campo vazio no pyHanko. */
async function copySelection(format: CopyFormat) {
  const coordinates = selection.coordinates(toolbar.lastPageOnly)
  if (!coordinates) return
  const text =
    format === 'command'
      ? `pyhanko sign addfields --field ${coordinates}/Signature1 input.pdf output.pdf`
      : coordinates
  try {
    await navigator.clipboard.writeText(text)
    showMessage(
      format === 'command'
        ? 'Comando pyHanko copiado. Ele cria um campo vazio; não assina o PDF.'
        : 'Coordenadas para pyHanko copiadas.'
    )
  } catch {
    showMessage(`Cópia automática indisponível. Selecione e copie: ${text}`)
  }
}

openButton.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (file) void openDocument(file)
})

window.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  if (start.hidden || opening) return
  event.dataTransfer.dropEffect = 'copy'
  start.classList.add('is-dragging')
})

window.addEventListener('dragleave', (event) => {
  if (
    event.clientX <= 0 ||
    event.clientY <= 0 ||
    event.clientX >= window.innerWidth ||
    event.clientY >= window.innerHeight
  ) {
    start.classList.remove('is-dragging')
  }
})

window.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  start.classList.remove('is-dragging')
  if (start.hidden || opening) return
  const files = event.dataTransfer.files
  if (files.length !== 1) {
    showMessage('Arraste apenas um PDF por vez.')
    return
  }
  void openDocument(files[0])
})
