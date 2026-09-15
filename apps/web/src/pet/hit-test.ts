// Only read a single alpha pixel from the current sprite, never its whole transparent box.
const images = new Map<string, { image: HTMLImageElement; context: CanvasRenderingContext2D | null }>()
export function petPixelAt(button: Element, clientX: number, clientY: number, ready?: () => void) {
  const viewport = button.querySelector<SVGSVGElement>('.pet-sprite > svg')
  const source = viewport?.querySelector('image')?.getAttribute('href')
  if (!viewport || !source) return true // Legacy photo scenes keep their existing hit area.
  let entry = images.get(source)
  if (!entry) {
    if (images.size >= 2) images.delete(images.keys().next().value!)
    const image = new Image(), canvas = document.createElement('canvas')
    entry = { image, context: null }; images.set(source, entry)
    const pending = entry
    image.onload = () => {
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      pending.context = canvas.getContext('2d', { willReadFrequently: true })
      pending.context?.drawImage(image, 0, 0)
      ready?.()
    }
    image.src = source
  }
  if (!entry.context) return false
  const matrix = viewport.getScreenCTM()
  if (!matrix) return false
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
  const box = viewport.viewBox.baseVal
  if (point.x < box.x || point.y < box.y || point.x >= box.x + box.width || point.y >= box.y + box.height) return false
  try { return entry.context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data[3] > 24 }
  catch { return true }
}
