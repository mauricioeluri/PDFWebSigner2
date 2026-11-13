const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export type CopyFormat = 'coordinates' | 'command'

/** Dados exibidos na barra; a página visível pode diferir da página da área. */
export interface ToolbarState {
  busy: boolean
  page: number
  pageCount: number
  selectionPage: number | null
  /** Zoom real usado pelos botões +/- ao ajustar à largura. */
  effectiveZoom: number
}

interface ToolbarActions {
  navigate: (page: number) => void
  zoom: (value: number) => void
  pin: (enabled: boolean) => void
  copy: (format: CopyFormat) => void
  clear: () => void
  close: () => void
  showSelection: () => void
  message: (text: string) => void
}

/**
 * Liga os controles HTML às ações do editor. O módulo só cuida da interface;
 * documento, seleção e cópia continuam no controlador.
 */
export function createToolbar(root: HTMLElement, actions: ToolbarActions) {
  const find = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!
  const previous = find<HTMLButtonElement>('.prev')
  const next = find<HTMLButtonElement>('.next')
  const pageNumber = find<HTMLInputElement>('.page-number')
  const pageCount = find<HTMLElement>('.page-count')
  const pin = find<HTMLInputElement>('.pin-last')
  const zoom = find<HTMLSelectElement>('.zoom')
  const zoomIn = find<HTMLButtonElement>('.zoom-in')
  const zoomOut = find<HTMLButtonElement>('.zoom-out')
  const clear = find<HTMLButtonElement>('.clear')
  const copyPosition = find<HTMLButtonElement>('.copy-pos')
  const copyCommand = find<HTMLButtonElement>('.copy-cmd')
  const selectionPage = find<HTMLButtonElement>('.selection-page')
  const selectionActions = find<HTMLElement>('.export')
  const close = find<HTMLButtonElement>('.close')
  const more = find<HTMLButtonElement>('.more')
  const options = find<HTMLElement>('#editor-options')
  const menuZoom = find<HTMLElement>('.menu-zoom')
  const pinOption = pin.closest('label')!
  const pinHome = pinOption.parentElement!
  const actionsHome = selectionActions.parentElement!
  const zoomHome = zoom.parentElement!
  const narrowScreen = window.matchMedia('(max-width: 600px)')
  const compactScreen = window.matchMedia('(max-width: 1280px)')
  let zoomChosenByUser = false
  let state: ToolbarState = {
    busy: false,
    page: 1,
    pageCount: 0,
    selectionPage: null,
    effectiveZoom: 0.75,
  }

  // Move os mesmos controles para o popover; não duplica estado nem listeners.
  function arrange() {
    options.hidePopover()
    if (compactScreen.matches) {
      options.append(pinOption, selectionActions, close)
    } else {
      pinHome.append(pinOption)
      actionsHome.append(selectionActions, close)
    }
    menuZoom.hidden = !narrowScreen.matches
    if (narrowScreen.matches) menuZoom.append(zoom)
    else zoomHome.append(zoom)
  }

  /** Reflete o estado do documento sem modificar a página ou a seleção. */
  function update(nextState: ToolbarState) {
    state = nextState
    const unavailable = state.busy || state.pageCount === 0
    const hasSelection = state.selectionPage !== null
    pageNumber.disabled = unavailable || pin.checked
    previous.disabled = unavailable || pin.checked || state.page === 1
    next.disabled = unavailable || pin.checked || state.page === state.pageCount
    pin.disabled = unavailable
    zoom.disabled = unavailable
    zoomOut.disabled = unavailable || state.effectiveZoom <= ZOOM_LEVELS[0]
    zoomIn.disabled =
      unavailable || state.effectiveZoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
    pageNumber.value = String(state.page)
    pageCount.textContent = state.pageCount ? `de ${state.pageCount}` : 'de —'
    selectionActions.hidden = !hasSelection
    for (const button of [clear, copyPosition, copyCommand, selectionPage]) {
      button.disabled = unavailable || !hasSelection
    }
    if (state.selectionPage !== null) {
      selectionPage.textContent = pin.checked
        ? 'Última pág.'
        : `Pág. ${state.selectionPage}`
      selectionPage.title = `Ir à área de assinatura na página ${state.selectionPage}`
    }
    close.hidden = state.pageCount === 0 && !state.busy
  }

  function navigateFromInput() {
    const text = pageNumber.value.trim()
    const requested = Number(text)
    pageNumber.value = String(state.page)
    if (state.busy || pin.checked) return
    if (!/^\d+$/.test(text) || requested < 1 || requested > state.pageCount) {
      actions.message(`Informe uma página de 1 a ${state.pageCount}.`)
      return
    }
    actions.navigate(requested)
  }

  function stepZoom(direction: number) {
    const levels = direction > 0 ? ZOOM_LEVELS : [...ZOOM_LEVELS].reverse()
    const value = levels.find((level) =>
      direction > 0
        ? level > state.effectiveZoom + 0.001
        : level < state.effectiveZoom - 0.001
    )
    if (value === undefined) return
    zoomChosenByUser = true
    zoom.value = String(value)
    actions.zoom(value)
  }

  previous.addEventListener('click', () => actions.navigate(state.page - 1))
  next.addEventListener('click', () => actions.navigate(state.page + 1))
  pageNumber.addEventListener('change', navigateFromInput)
  pageNumber.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      navigateFromInput()
    } else if (event.key === 'Escape') {
      pageNumber.value = String(state.page)
      pageNumber.blur()
    }
  })
  zoomOut.addEventListener('click', () => stepZoom(-1))
  zoomIn.addEventListener('click', () => stepZoom(1))
  zoom.addEventListener('change', () => {
    zoomChosenByUser = true
    actions.zoom(Number(zoom.value))
  })
  pin.addEventListener('change', () => actions.pin(pin.checked))
  clear.addEventListener('click', actions.clear)
  close.addEventListener('click', actions.close)
  copyPosition.addEventListener('click', () => actions.copy('coordinates'))
  copyCommand.addEventListener('click', () => actions.copy('command'))
  selectionPage.addEventListener('click', actions.showSelection)
  options.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('button'))
      options.hidePopover()
  })
  compactScreen.addEventListener('change', arrange)
  narrowScreen.addEventListener('change', () => {
    arrange()
    // A largura da tela só escolhe o zoom inicial; uma escolha manual prevalece.
    if (!zoomChosenByUser) zoom.value = narrowScreen.matches ? '0' : '0.75'
    actions.zoom(Number(zoom.value))
  })
  if (narrowScreen.matches) zoom.value = '0'
  arrange()
  update(state)

  return {
    update,
    get zoom() {
      return Number(zoom.value)
    },
    get lastPageOnly() {
      return pin.checked
    },
    focusClose() {
      if (compactScreen.matches) more.focus()
      else close.focus()
    },
    closeMenu() {
      options.hidePopover()
    },
  }
}
