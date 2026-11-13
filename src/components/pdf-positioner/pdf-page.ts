/**
 * Página do PDF.
 *
 * Mantém sua geometria e a marcação enquanto cria ou libera o canvas conforme
 * a proximidade da área visível.
 *
 * @packageDocumentation
 */
import type { PDFPageProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import {
  toScreenRectangle,
  type PdfRectangle,
  type ScreenRectangle,
} from './geometry'

const MAX_RENDER_WIDTH = 1000
const MAX_RENDER_HEIGHT = 1600
const MAX_RENDER_SCALE = 1.5

/**
 * Mantém dimensões e marcação mesmo quando o canvas é liberado ao sair da tela.
 * A viewport usada nas coordenadas fica estável durante o zoom CSS.
 */
export class PdfPage {
  readonly element: HTMLElement
  readonly layer: HTMLElement
  readonly mark: HTMLElement
  readonly viewport: PageViewport
  /** Identifica recorte, rotação e unidades para reaplicar na última página. */
  readonly geometry: string
  readonly width: number
  readonly height: number

  private readonly canvas: HTMLCanvasElement
  private renderTask: RenderTask | null = null
  private nearby = false
  private disposed = false
  private failed = false
  private ready = false

  constructor(
    readonly number: number,
    private readonly proxy: PDFPageProxy,
    template: HTMLElement,
    private readonly reportError: (message: string) => void
  ) {
    const original = proxy.getViewport({ scale: 1 })
    this.width = original.width
    this.height = original.height
    this.viewport = proxy.getViewport({
      scale: Math.min(
        MAX_RENDER_SCALE,
        MAX_RENDER_WIDTH / this.width,
        MAX_RENDER_HEIGHT / this.height
      ),
    })
    this.geometry = JSON.stringify([proxy.view, proxy.rotate, proxy.userUnit])
    this.element = template.cloneNode(true) as HTMLElement
    this.element.dataset.page = String(number)
    this.element.setAttribute('aria-label', `Página ${number}`)
    this.element.hidden = false
    this.canvas = this.element.querySelector<HTMLCanvasElement>('canvas')!
    this.layer = this.element.querySelector<HTMLElement>('.selection-layer')!
    this.mark = this.element.querySelector<HTMLElement>('.mark')!
    this.setReady(false)
  }

  get rendered() {
    return this.ready
  }

  /** Altera só o tamanho exibido; não muda as coordenadas PDF. */
  resize(width: number) {
    this.element.style.width = `${width}px`
    this.element.style.height = `${(width * this.height) / this.width}px`
  }

  /** Reprojeta a área salva ao renderizar ou redimensionar a página. */
  showSelection(box: PdfRectangle) {
    this.showPreview(toScreenRectangle(this.viewport, box))
  }

  showPreview(rectangle: ScreenRectangle) {
    Object.assign(this.mark.style, {
      left: `${rectangle.left * 100}%`,
      top: `${rectangle.top * 100}%`,
      width: `${(rectangle.right - rectangle.left) * 100}%`,
      height: `${(rectangle.bottom - rectangle.top) * 100}%`,
    })
    this.mark.hidden = false
  }

  hideSelection() {
    this.mark.hidden = true
  }

  /** Mantém pixels apenas perto da tela; a área marcada fica no DOM da página. */
  setNearby(nearby: boolean) {
    this.nearby = nearby
    if (nearby) {
      void this.render()
    } else if (this.renderTask) {
      this.renderTask.cancel()
    } else if (this.ready) {
      this.releaseCanvas()
    }
  }

  dispose() {
    this.disposed = true
    this.nearby = false
    this.renderTask?.cancel()
    if (!this.renderTask) this.releaseCanvas()
  }

  private setReady(ready: boolean) {
    this.ready = ready
    this.layer.setAttribute('aria-disabled', String(!ready))
  }

  /** Libera pixels e recursos de renderização sem remover a marcação. */
  private releaseCanvas() {
    this.canvas.width = 0
    this.canvas.height = 0
    this.setReady(false)
    this.proxy.cleanup()
  }

  /** Renderiza apenas quando necessário; cancelamentos permitem nova tentativa. */
  private async render() {
    if (this.ready || this.renderTask || this.failed || this.disposed) return

    this.canvas.width = Math.ceil(this.viewport.width)
    this.canvas.height = Math.ceil(this.viewport.height)
    this.element.setAttribute('aria-busy', 'true')

    try {
      this.renderTask = this.proxy.render({
        canvas: this.canvas,
        viewport: this.viewport,
      })
      await this.renderTask.promise
      this.setReady(true)
    } catch (error) {
      const cancelled =
        error instanceof Error && error.name === 'RenderingCancelledException'
      if (!cancelled && !this.disposed) {
        this.failed = true
        this.reportError(
          `Não foi possível renderizar a página ${this.number}. Reabra o PDF para tentar novamente.`
        )
      }
    } finally {
      this.renderTask = null
      this.element.setAttribute('aria-busy', 'false')
      if (!this.nearby || this.disposed) this.releaseCanvas()
      else if (!this.ready && !this.failed) void this.render()
    }
  }
}
