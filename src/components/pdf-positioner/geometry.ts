/**
 * Geometria da área de assinatura.
 *
 * Operações geométricas sem acesso ao DOM. Retângulos da tela usam frações da
 * página visível; retângulos exportados usam coordenadas cartesianas do PDF.
 * A viewport do PDF.js faz a conversão entre esses espaços.
 *
 * @packageDocumentation
 */
import type { PageViewport } from 'pdfjs-dist'

/** Caixa em unidades do PDF: esquerda, baixo, direita, cima. */
export type PdfRectangle = readonly [
  left: number,
  bottom: number,
  right: number,
  top: number,
]

/** Ponto em frações da página visível, com origem no canto superior esquerdo. */
export interface Point {
  x: number
  y: number
}

/** Frações da área visível da página, entre 0 e 1, com origem no canto superior esquerdo. */
export interface ScreenRectangle {
  left: number
  top: number
  right: number
  bottom: number
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** Limita um valor ao intervalo indicado; por padrão, a fração de uma página. */
export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value))
}

/** Normaliza os cantos, independentemente da direção do arraste. */
export function rectangleBetween(start: Point, end: Point): ScreenRectangle {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  }
}

/** Move a área inteira sem deixá-la ultrapassar as bordas visíveis. */
export function moveRectangle(rectangle: ScreenRectangle, delta: Point) {
  const dx = clamp(delta.x, -rectangle.left, 1 - rectangle.right)
  const dy = clamp(delta.y, -rectangle.top, 1 - rectangle.bottom)

  return {
    left: rectangle.left + dx,
    top: rectangle.top + dy,
    right: rectangle.right + dx,
    bottom: rectangle.bottom + dy,
  }
}

/** Redimensiona pelo canto escolhido; o canto oposto permanece fixo. */
export function resizeRectangle(
  rectangle: ScreenRectangle,
  corner: Corner,
  delta: Point
) {
  const west = corner.includes('w')
  const north = corner.includes('n')
  const fixed = {
    x: west ? rectangle.right : rectangle.left,
    y: north ? rectangle.bottom : rectangle.top,
  }
  const moving = {
    x: clamp((west ? rectangle.left : rectangle.right) + delta.x),
    y: clamp((north ? rectangle.top : rectangle.bottom) + delta.y),
  }

  return rectangleBetween(fixed, moving)
}

/**
 * Projeta a caixa do PDF sobre a página exibida. A viewport incorpora rotação,
 * CropBox e origem; o resultado é independente do tamanho CSS do canvas.
 */
export function toScreenRectangle(
  viewport: PageViewport,
  box: PdfRectangle
): ScreenRectangle {
  const start = viewport.convertToViewportPoint(box[0], box[1])
  const end = viewport.convertToViewportPoint(box[2], box[3])

  return rectangleBetween(
    { x: start[0] / viewport.width, y: start[1] / viewport.height },
    { x: end[0] / viewport.width, y: end[1] / viewport.height }
  )
}

/**
 * Converte a área visível para X1,Y1,X2,Y2 do pyHanko.
 * Retorna null quando o arraste ou o arredondamento não produz área útil.
 */
export function toPdfRectangle(
  viewport: PageViewport,
  rectangle: ScreenRectangle
): PdfRectangle | null {
  const { left, top, right, bottom } = rectangle
  if (right - left < 0.005 || bottom - top < 0.005) return null

  // A transformação inversa inclui rotação, recorte e origem da área visível.
  const start = viewport.convertToPdfPoint(
    left * viewport.width,
    top * viewport.height
  )
  const end = viewport.convertToPdfPoint(
    right * viewport.width,
    bottom * viewport.height
  )
  const box: PdfRectangle = [
    Math.round(Math.min(start[0], end[0])),
    Math.round(Math.min(start[1], end[1])),
    Math.round(Math.max(start[0], end[0])),
    Math.round(Math.max(start[1], end[1])),
  ]

  return box[2] > box[0] && box[3] > box[1] ? box : null
}

/** Aceita uma pequena sobra causada pelo arredondamento para unidades inteiras. */
export function fitsPage(rectangle: ScreenRectangle) {
  const tolerance = 0.002
  return (
    rectangle.left >= -tolerance &&
    rectangle.top >= -tolerance &&
    rectangle.right <= 1 + tolerance &&
    rectangle.bottom <= 1 + tolerance
  )
}
