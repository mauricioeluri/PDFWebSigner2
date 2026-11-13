/**
 * Seleção da área de assinatura.
 *
 * Interpreta arraste e duplo clique para criar, mover ou redimensionar uma área.
 * A seleção única é armazenada em coordenadas PDF e independe da página visível.
 *
 * @packageDocumentation
 */
import type { PdfPage } from './pdf-page'
import {
  clamp,
  fitsPage,
  moveRectangle,
  rectangleBetween,
  resizeRectangle,
  toPdfRectangle,
  toScreenRectangle,
  type Corner,
  type PdfRectangle,
  type Point,
  type ScreenRectangle,
} from './geometry'

// Tamanho inicial do duplo clique na viewport da página em escala 1.
const DEFAULT_WIDTH = 150
const DEFAULT_HEIGHT = 50

/** Única área persistida na sessão; a página visível pode ser outra. */
export interface Signature {
  readonly page: number
  readonly box: PdfRectangle
  /** Recorte, rotação e unidades da página para validar reutilização. */
  readonly geometry: string
}

interface Gesture {
  page: PdfPage
  pointerId: number
  start: Point
  mode: 'draw' | 'move' | 'resize'
  corner: Corner | null
  originalBox: PdfRectangle | null
  initialBounds: ScreenRectangle | null
  previewBox: PdfRectangle | null
}

/**
 * Mantém uma única área em coordenadas PDF. Os gestos usam frações da página
 * exibida; assim, rolagem e zoom não alteram a posição salva.
 */
export class SignatureSelection {
  private signature: Signature | null = null
  private gesture: Gesture | null = null

  constructor(
    container: HTMLElement,
    private readonly getPage: (number: number) => PdfPage | undefined,
    private readonly onChange: () => void
  ) {
    container.addEventListener('pointerdown', this.startGesture)
    container.addEventListener('pointermove', this.updateGesture)
    container.addEventListener('pointerup', this.finishGesture)
    container.addEventListener('pointercancel', this.cancelGesture)
    container.addEventListener('lostpointercapture', this.cancelGesture)
    container.addEventListener('dblclick', this.placeDefault)
  }

  get current() {
    return this.signature
  }

  get editing() {
    return this.gesture !== null
  }

  /** Remove a área atual e interrompe um gesto em andamento. */
  clear() {
    this.gesture?.page.hideSelection()
    this.releasePointer()
    if (this.signature) this.getPage(this.signature.page)?.hideSelection()
    this.signature = null
    this.onChange()
  }

  /** Reaplica uma área guardada somente quando ela cabe na nova página. */
  restore(page: PdfPage, box: PdfRectangle) {
    if (!fitsPage(toScreenRectangle(page.viewport, box))) return false
    this.commit(page, box)
    return true
  }

  /** Formata PAGE/X1,Y1,X2,Y2; -1 identifica a última página para o pyHanko. */
  coordinates(lastPageOnly: boolean) {
    if (!this.signature) return ''
    const page = lastPageOnly ? -1 : this.signature.page
    return `${page}/${this.signature.box.join(',')}`
  }

  /** Substitui a área anterior, inclusive quando ela estava em outra página. */
  private commit(page: PdfPage, box: PdfRectangle) {
    if (this.signature) this.getPage(this.signature.page)?.hideSelection()
    this.signature = { page: page.number, box, geometry: page.geometry }
    page.showSelection(box)
    this.onChange()
  }

  /** Converte a posição do ponteiro para frações da página, limitadas a 0–1. */
  private point(event: MouseEvent, page: PdfPage): Point {
    const bounds = page.layer.getBoundingClientRect()
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    }
  }

  /** Identifica a página de um evento disparado na camada ou na marcação. */
  private pageAt(target: EventTarget | null): PdfPage | undefined {
    if (!(target instanceof HTMLElement)) return
    const sheet = target.closest<HTMLElement>('.sheet')
    if (!sheet) return
    return this.getPage(Number(sheet.dataset.page))
  }

  private startGesture = (event: PointerEvent) => {
    if (this.gesture || !event.isPrimary || event.button !== 0) return
    if (!(event.target instanceof HTMLElement)) return
    const page = this.pageAt(event.target)
    if (!page?.rendered) return

    const corner = event.target.dataset.corner
    const resizeCorner =
      corner === 'nw' || corner === 'ne' || corner === 'sw' || corner === 'se'
        ? corner
        : null
    const originalBox =
      this.signature?.page === page.number ? this.signature.box : null
    let mode: Gesture['mode'] = 'draw'
    if (resizeCorner) mode = 'resize'
    else if (event.target.closest('.mark')) mode = 'move'

    this.gesture = {
      page,
      pointerId: event.pointerId,
      start: this.point(event, page),
      mode,
      corner: resizeCorner,
      originalBox,
      initialBounds: originalBox
        ? toScreenRectangle(page.viewport, originalBox)
        : null,
      previewBox: null,
    }
    if (mode === 'draw') page.hideSelection()
    page.layer.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  /** Calcula cada prévia a partir do gesto inicial para evitar deriva acumulada. */
  private updateGesture = (event: PointerEvent) => {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const end = this.point(event, gesture.page)
    const delta = { x: end.x - gesture.start.x, y: end.y - gesture.start.y }
    let rectangle = rectangleBetween(gesture.start, end)

    if (gesture.mode === 'move' && gesture.initialBounds) {
      rectangle = moveRectangle(gesture.initialBounds, delta)
    } else if (
      gesture.mode === 'resize' &&
      gesture.initialBounds &&
      gesture.corner
    ) {
      rectangle = resizeRectangle(gesture.initialBounds, gesture.corner, delta)
    }
    gesture.previewBox = toPdfRectangle(gesture.page.viewport, rectangle)
    if (gesture.previewBox) gesture.page.showPreview(rectangle)
    else gesture.page.hideSelection()
  }

  private finishGesture = (event: PointerEvent) => {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    this.updateGesture(event)
    // Um clique sem área nova preserva a marcação anterior.
    const box = gesture.previewBox ?? gesture.originalBox
    this.releasePointer()
    if (box) this.commit(gesture.page, box)
  }

  /** O duplo clique usa o ponto pressionado como canto superior esquerdo. */
  private placeDefault = (event: MouseEvent) => {
    if (event.button !== 0) return
    const page = this.pageAt(event.target)
    if (!page?.rendered) return

    const point = this.point(event, page)
    // As dimensões vêm da viewport em escala 1, então o zoom não muda o tamanho no PDF.
    const rectangle: ScreenRectangle = {
      left: point.x,
      top: point.y,
      right: clamp(point.x + DEFAULT_WIDTH / page.width),
      bottom: clamp(point.y + DEFAULT_HEIGHT / page.height),
    }
    const box = toPdfRectangle(page.viewport, rectangle)
    if (box) this.commit(page, box)
    event.preventDefault()
  }

  private cancelGesture = (event: PointerEvent) => {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    // Uma interrupção restaura a área anterior antes de considerar a prévia.
    const box = gesture.originalBox ?? gesture.previewBox
    this.releasePointer()
    if (box) this.commit(gesture.page, box)
  }

  private releasePointer() {
    const gesture = this.gesture
    this.gesture = null
    if (gesture?.page.layer.hasPointerCapture(gesture.pointerId)) {
      gesture.page.layer.releasePointerCapture(gesture.pointerId)
    }
  }
}
