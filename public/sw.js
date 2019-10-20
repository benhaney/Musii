let cache_list = new Set([
  '/',
  '/api/list/artists',
  '/api/list/albums',
  '/api/list/songs',
  '/img/icons-192.png',
  '/img/icons-512.png',
  '/manifest.webmanifest'
])

let cache_exts = new Set(['js', 'css'])

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('static').then(cache =>
      cache.addAll([...cache_list])
    )
  )
})

self.addEventListener('fetch', event => {
  let path = `/${event.request.url.split('#')[0].split('/').slice(3).join('/')}`
  let ext = (path.match(/\.(.+)$/)||[])[1]
  if (!(cache_list.has(path) || cache_exts.has(ext) || path.startsWith('/api/list/'))) return
  event.respondWith(
    caches.open('static').then(cache =>
      cache.match(event.request).then(cached =>
        (cached || Promise.reject('no-match'))
      )
    ).catch(() => new Promise((a,r) => fetch(event.request).then(a,r)))
  )
  event.waitUntil(
    caches.open('static').then(cache =>
      fetch(event.request).then(res =>
        cache.put(event.request, res)
      )
    )
  )
})
