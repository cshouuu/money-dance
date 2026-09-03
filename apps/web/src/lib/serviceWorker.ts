const SERVICE_WORKER_PATH = '/sw.js'
const UPDATE_READY_EVENT = 'money-dance:update-ready'

export async function registerMoneyDanceServiceWorker(): Promise<void> {
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { updateViaCache: 'none' })
  const observedWorkers = new WeakSet<ServiceWorker>()
  let notifiedWorker: ServiceWorker | null = null

  const notifyUpdateReady = (worker: ServiceWorker | null) => {
    if (!navigator.serviceWorker.controller || !worker || notifiedWorker === worker) return
    notifiedWorker = worker
    window.dispatchEvent(new Event(UPDATE_READY_EVENT))
  }

  const observeInstallingWorker = () => {
    const worker = registration.installing
    if (!worker || observedWorkers.has(worker)) return
    observedWorkers.add(worker)
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') notifyUpdateReady(worker)
    })
  }

  registration.addEventListener('updatefound', observeInstallingWorker)
  observeInstallingWorker()
  notifyUpdateReady(registration.waiting)

  try {
    await registration.update()
  } catch {
    // A failed update check must never prevent the current application from
    // starting; the browser will retry its normal service-worker update cycle.
  }

  observeInstallingWorker()
  notifyUpdateReady(registration.waiting)
}
