let cache_list = new Set([
  '/',
  '/#artists',
  '/#albums',
  '/#songs',
  '/api/list/artists',
  '/api/list/albums',
  '/api/list/songs',
  '/img/icons-192.png',
  '/img/icons-512.png',
  '/manifest.webmanifest'
])

let cache_exts = new Set(['js', 'css'])

/*
self.addEventListener('install', event => {
  event.waitUntil(async () => {
    let cache = await caches.open('static')
    cache.addAll([...cache_list])
  })
})
*/

self.addEventListener('fetch', event => {
  let path = `/${event.request.url.split('/').slice(3).join('/')}`
  let ext = (path.match(/\.(.+)$/)||[])[1]
  if (!cache_list.has(path) && !cache_exts.has(ext)) return
  event.respondWith(
    fetch(event.request).then(res => {
      let res_cache = res.clone()
      caches.open('static').then(cache => cache.put(event.request, res_cache))
      return res
    }).catch(() => {
      return caches.open('static')
        .then(cache => cache.match(event.request))
        .then(res => res || Promise.reject('no-match'))
    })
  )
})
