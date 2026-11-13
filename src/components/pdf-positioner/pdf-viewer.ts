/**
 * Visualizador de PDF.
 *
 * Gerencia o documento PDF.js, a navegação contínua e o zoom. Calcula a página
 * mais visível e pede renderização apenas às páginas próximas da tela.
 *
 * @packageDocumentation
 */
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PdfPage } from './pdf-page'

GlobalWorkerOptions.workerSrc = workerUrl
const PDF_TO_CSS_SCALE = 4 / 3

/**
 * Controla o documento e a página visível. A seleção pertence a outro módulo:
 * rolar ou descartar um canvas não altera a área de assinatura.
 */
export class PdfViewer {
  private readonly pages: PdfPage[] = []
  private readonly template: HTMLElement
  private task: PDFDocumentLoadingTask | null = null
  // Descarta respostas assíncronas de um PDF já fechado ou substituído.
  private revision = 0
  private scrollFrame = 0
  private readonly resizeObserver: ResizeObserver
  private observedWidth = 0
  // Número da página mostrada na barra; não é a página da seleção.
  private activePage = 1
  private loading = false
  private zoom = 0.75
  private lastPageOnly = false

  constructor(
    readonly container: HTMLElement,
    private readonly onChange: () => void,
    private readonly reportError: (message: string) => void,
    private readonly isEditing: () => boolean
  ) {
    this.template = container.querySelector<HTMLElement>('.sheet')!
    this.template.remove()
    container.addEventListener('scroll', this.scheduleVisibility, {
      passive: true,
    })
    this.resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth
      if (width === this.observedWidth) return
      this.observedWidth = width
      if (this.zoom === 0 && !this.isEditing()) this.layout()
    })
    this.resizeObserver.observe(container)
  }

  get pageNumber() {
    return this.activePage
  }

  get pageCount() {
    return this.pages.length
  }

  get busy() {
    return this.loading
  }

  get currentPage() {
    return this.getPage(this.activePage)
  }

  get effectiveZoom() {
    const page = this.currentPage
    if (this.zoom !== 0 || !page) return this.zoom
    return (
      page.element.getBoundingClientRect().width / page.width / PDF_TO_CSS_SCALE
    )
  }

  getPage(number: number): PdfPage | undefined {
    return this.pages[number - 1]
  }

  /** Abre bytes locais, cria as páginas e renderiza só as próximas da tela. */
  async open(data: Uint8Array, lastPageOnly: boolean) {
    const revision = ++this.revision
    this.loading = true
    this.lastPageOnly = lastPageOnly
    this.onChange()
    const base = `${import.meta.env.BASE_URL}pdfjs/`
    const task = getDocument({
      data,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`,
      enableXfa: false,
    })
    this.task = task

    try {
      const document = await task.promise
      if (revision !== this.revision) return
      for (let number = 1; number <= document.numPages; number++) {
        const proxy = await document.getPage(number)
        if (revision !== this.revision) return
        const page = new PdfPage(number, proxy, this.template, this.reportError)
        this.pages.push(page)
        this.container.append(page.element)
      }
      this.activePage = lastPageOnly ? this.pageCount : 1
      this.loading = false
      this.layout(false)
      this.goTo(this.activePage)
    } finally {
      if (revision === this.revision) {
        this.loading = false
        this.onChange()
      }
    }
  }

  /** Invalida leituras pendentes e libera páginas e worker do documento. */
  async close() {
    ++this.revision
    cancelAnimationFrame(this.scrollFrame)
    const task = this.task
    this.task = null
    for (const page of this.pages) page.dispose()
    this.pages.length = 0
    this.container.replaceChildren()
    this.activePage = 1
    this.loading = false
    this.onChange()
    await task?.destroy()
  }

  /** Usa 0 para ajustar à largura; demais valores são fatores de escala. */
  setZoom(zoom: number) {
    this.zoom = zoom
    this.layout()
  }

  setLastPageOnly(enabled: boolean) {
    this.lastPageOnly = enabled
    if (enabled) this.activePage = this.pageCount
    this.layout(false)
    this.goTo(this.activePage)
  }

  /** Rola até a página indicada, numerada a partir de 1. */
  goTo(number: number) {
    const page = this.getPage(number)
    if (!page || this.loading || this.isEditing()) return
    if (this.lastPageOnly && number !== this.pageCount) return
    this.activePage = number
    const offset =
      page.element.getBoundingClientRect().top -
      this.container.getBoundingClientRect().top -
      this.padding.top
    this.container.scrollTop += offset
    this.onChange()
    this.scheduleVisibility()
  }

  refreshVisibility() {
    this.scheduleVisibility()
  }

  private get padding() {
    const style = getComputedStyle(this.container)
    return {
      top: parseFloat(style.paddingTop),
      horizontal:
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
    }
  }

  /**
   * Recalcula larguras e preserva a fração já percorrida da página ativa.
   * Essa posição precisa ser medida antes de alterar as dimensões CSS.
   */
  private layout(preservePosition = true) {
    if (this.loading || !this.pageCount) return
    const current = this.currentPage
    const bounds = this.container.getBoundingClientRect()
    const rectangle = current?.element.getBoundingClientRect()
    const pageProgress =
      preservePosition && rectangle && rectangle.height > 0
        ? Math.max(0, bounds.top - rectangle.top) / rectangle.height
        : 0
    const padding = this.padding
    const availableWidth = Math.max(
      100,
      this.container.clientWidth - padding.horizontal
    )

    for (const page of this.pages) {
      const width =
        this.zoom === 0
          ? availableWidth
          : page.width * PDF_TO_CSS_SCALE * this.zoom
      page.resize(width)
      page.element.hidden = this.lastPageOnly && page.number !== this.pageCount
    }
    if (current) {
      const next = current.element.getBoundingClientRect()
      this.container.scrollTop +=
        next.top - bounds.top + pageProgress * next.height - padding.top
    }
    this.updateVisibility()
    this.onChange()
  }

  // Agrupa eventos de rolagem para medir páginas uma vez por quadro.
  private scheduleVisibility = () => {
    cancelAnimationFrame(this.scrollFrame)
    this.scrollFrame = requestAnimationFrame(() => this.updateVisibility())
  }

  /** Atualiza a página ativa e retém canvases próximos, sem tocar na seleção. */
  private updateVisibility() {
    if (this.loading) return
    const bounds = this.container.getBoundingClientRect()
    let mostVisiblePage = this.activePage
    let largestVisibleHeight = 0

    for (const page of this.pages) {
      const rectangle = page.element.getBoundingClientRect()
      const visibleHeight = page.element.hidden
        ? 0
        : Math.max(
            0,
            Math.min(rectangle.bottom, bounds.bottom) -
              Math.max(rectangle.top, bounds.top)
          )
      if (visibleHeight > largestVisibleHeight) {
        largestVisibleHeight = visibleHeight
        mostVisiblePage = page.number
      }
      const nearby =
        !page.element.hidden &&
        rectangle.bottom >= bounds.top - bounds.height &&
        rectangle.top <= bounds.bottom + bounds.height
      page.setNearby(nearby)
    }
    if (!this.isEditing() && mostVisiblePage !== this.activePage) {
      this.activePage = mostVisiblePage
      this.onChange()
    }
  }
}
