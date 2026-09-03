const SERVICE_WORKER_PATH = '/sw.js'

export async function registerMoneyDanceServiceWorker(): Promise<void> {
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { updateViaCache: 'none' })
  let activationRequested = false
  let requestedWorker: ServiceWorker | null = null
  let reloading = false
  const observedWorkers = new WeakSet<ServiceWorker>()

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!activationRequested || reloading) return
    reloading = true
    window.location.reload()
  })

  const requestActivation = () => {
    const waiting = registration.waiting
    if (!navigator.serviceWorker.controller || !waiting || requestedWorker === waiting) return
    requestedWorker = waiting
    activationRequested = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  const observeInstallingWorker = () => {
    const worker = registration.installing
    if (!worker || observedWorkers.has(worker)) return
    observedWorkers.add(worker)
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') requestActivation()
    })
  }

  registration.addEventListener('updatefound', observeInstallingWorker)
  observeInstallingWorker()

  requestActivation()
  await registration.update()
  observeInstallingWorker()
  requestActivation()
}
