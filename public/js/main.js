// Buncha convenience functions
let $ = s => document.querySelectorAll(s)
$.create = e => document.createElement(e)

let displayTime = t => `${~~(t/60)}:${(Math.round(t)%60+'').padStart(2, '0')}`

let save_scroll = () => history.replaceState({scroll: window.scrollY}, undefined, window.location)
let navto = h => (save_scroll(), window.location = h)

// We have an event listener on DOM-based navigation for saving the current scroll position,
// but if the user uses their back button or something else we can't catch before it happens,
// we can't save the scroll position of the page they're leaving. When they go forward in history,
// they'll lose the scroll position of that page unless we have another way to save it.
// We could attach a listener to scrolling, but that kills scroll performance and there's no
// "scrollend" event. We could attach it to "touchend" and assume the user must make a touch to
// scroll, but this won't capture the end of momentum-scrolling. As much as I hate it, let's just
// save the scroll position on an interval.
window.setInterval(save_scroll, 500)

// IntersectionObserver for lazy loading any image when it gets close to the viewport
let lazyloader = new IntersectionObserver((entries, observer) => {
  entries.forEach(e => {
    e.target.src = (e.intersectionRatio > 0) ? e.target.attributes['data-src'].value : ''
  })
}, {rootMargin: '100%'})

// These get used frequently and don't change, so let's not call out to querySelectorAll each time.
let player = $('#player')[0]
let playerBar = $('#player-bar')[0]
let seekbar = $('#seekbar')[0]
let main = $('main')[0]

// Patch the player-functionality we need into an Audio instance
let audio = new Audio()
audio.preloader = new Audio()
audio.preloader.preload = 'auto'
audio.queue = []
audio.set = function(song) {
  this.active = song
  this.src = `/audio/${[song.song, song.album, song.artist]
    .filter(x => x)
    .map(encodeURIComponent).join('/')}`
  $('#current-thumb')[0].src = `/art/${song.artist}/${song.album}/100`
  let spans = $('#player-bar .bar span')
  spans[0].innerHTML = song.song
  spans[1].innerHTML = song.artist
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.song,
      artist: song.artist,
      album: song.album,
      artwork: [
        { src: `/art/${song.artist}/${song.album}/100`, sizes: '100x100' },
        { src: `/art/${song.artist}/${song.album}/300`, sizes: '300x300' }
      ]
    })
  }
  controls_update()
  buffer_update()
  $('#queue .song').forEach(el => el.className = el.meta == audio.active ? 'song active' : 'song')
  let x = $('#queue .song.active')[0]
  if (!x.scrollIntoViewIfNeeded) x.scrollIntoViewIfNeeded = x.scrollIntoView
  x.scrollIntoViewIfNeeded()
  if (player.className == 'hidden') player.className = ''
  localStorage.setItem('active', audio.queue.indexOf(audio.active))
  localStorage.setItem('position', '0')
}
audio.prev = function() {
  if (this.queue.length < 2) return false
  this.set(this.queue[this.queue.indexOf(this.active)-1])
  this.play()
}
audio.next = function() {
  if (!this.queue.length) return false
  let i = this.queue.indexOf(this.active)
  if (!this.queue[i+1]) return
  this.set(this.queue[i+1])
  this.play()
}
audio.push = function(song) {
  this.queue.push(song)
  queue_push(song)
  if (this.queue.length == 1 || audio.ended) {
    this.set(song)
    this.play()
  }
  fetch(`/hint/audio/${[song.song, song.album, song.artist]
    .filter(x => x)
    .map(encodeURIComponent).join('/')}`)
  audio.precache()
  controls_update()
  localStorage.setItem('queue', JSON.stringify(audio.queue))
}
audio.delete = function(song) {
  let i = this.queue.indexOf(song)
  if (song == this.active) {
    if (i < this.queue.length - 1) this.next()
    else if (i > 0) { this.prev(); this.pause() }
    else {
      audio.pause()
      audio.src = '//'
      player.className = 'hidden'
    }
  }
  if (i < 0) return
  this.queue.splice(i, 1)
  controls_update()
  localStorage.setItem('queue', JSON.stringify(audio.queue))
  localStorage.setItem('active', audio.queue.indexOf(audio.active))
}
audio.precache = function() {
  let song = this.queue[this.queue.indexOf(this.active)+1]
  if (!song) return
  this.preloader.src = `/audio/${[song.song, song.album, song.artist]
    .filter(x => x)
    .map(encodeURIComponent).join('/')}`
}

let controls_update = () => {
  let i = audio.queue.indexOf(audio.active)
  $('#player button.prev').forEach(el => el.disabled = (i == 0))
  $('#player button.next').forEach(el => el.disabled = (i == audio.queue.length - 1))
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('previoustrack', (i == 0) ? null : (()=>{ audio.prev() }))
    navigator.mediaSession.setActionHandler('nexttrack', (i == audio.queue.length - 1) ? null : (()=>{ audio.next() }))
  }
}

let buffer_update = () => {
  let gradient = Array.from(audio.buffered)
    .map((_, i) => [audio.buffered.start(i), audio.buffered.end(i)].map(x => x / audio.duration * 100))
    .map(x => `var(--seekbar-color-light) ${x[0]}%, var(--seekbar-color) ${x[0]}% ${x[1]}%, var(--seekbar-color-light) ${x[1]}%`)
    .join(', ')
  seekbar.style.setProperty(
    '--seekbar-track-bg',
    `linear-gradient(to right, var(--seekbar-color-light) 0%, ${gradient + (gradient && ',')} var(--seekbar-color-light) 100%)`
  )
}

// Audio event listeners
audio.addEventListener('ended', ev => audio.next())
audio.addEventListener('waiting', ev => {
  document.body.setAttribute('data-state', 'buffering')
  buffer_update()
})
audio.addEventListener('playing', ev => {
  document.body.setAttribute('data-state', 'playing')
  buffer_update()
})
audio.addEventListener('pause', ev => {
  document.body.setAttribute('data-state', 'paused')
})
audio.addEventListener('loadedmetadata', ev => {
  seekbar.max = audio.duration
  $('#time-duration > span')[0].innerText = displayTime(audio.duration)
})
audio.addEventListener('timeupdate', ev => {
  if (!seekbar.dragging) seekbar.value = audio.currentTime
  $('#time-progress > span')[0].innerText = displayTime(audio.currentTime)
  localStorage.setItem('position', audio.currentTime)
})
audio.addEventListener('error', ev => {
  console.log(ev)
  window.setTimeout(() => {
    let t = audio.currentTime
    if (audio.src.length < 7) return
    audio.src = `${audio.src.replace(/\?.*$/, '')}?err=${(Math.random()+'').slice(2)}`
    audio.currentTime = t
    audio.play()
  }, 200)
})
audio.addEventListener('canplaythrough', ev => audio.precache())
audio.addEventListener('progress', buffer_update)

seekbar.addEventListener('touchstart', ev => seekbar.dragging = true, { passive: true })
seekbar.addEventListener('touchend', ev => seekbar.dragging = false, { passive: true })
seekbar.addEventListener('change', ev => audio.currentTime = seekbar.value)

$('button.control').forEach(el => el.addEventListener('click', ev => {
  if (audio.paused) { audio.play() } else { audio.pause() }
  ev.stopPropagation()
}))
$('button.prev').forEach(el => el.addEventListener('click', ev => {
  audio.prev()
  ev.stopPropagation()
}))
$('button.next').forEach(el => el.addEventListener('click', ev => {
  audio.next()
  ev.stopPropagation()
}))

$('#player-bar')[0].addEventListener('click', ev => {
  document.body.setAttribute('data-player',  document.body.getAttribute('data-player') == 'open' ? 'closed' : 'open')
})

// Functions for building pages
let render_timer = false
let render_generic = (data, type, builder) => {
  clearInterval(render_timer)
  lazyloader.disconnect()
  main.className = `${type}s`
  while (main.lastChild) main.removeChild(main.lastChild)
  let renderer = () => {
    if (!data.length) return
    while ((window.scrollY + window.innerHeight) / document.body.scrollHeight > 0.5 && data.length) {
      data.splice(0,100).forEach(d => {
        let el = $.create('div')
        el.className = type
        el.meta = d
        builder(el, d)
        main.appendChild(el)
      })
    }
    render_timer = setTimeout(renderer, 500)
  }
  renderer()
}

let render_artists = data => {
  render_generic(data, 'artist', (el, d) => {
    el.innerHTML = `
    <div class="bar">
      <span>${d.artist}</span>
      <button class="batch-add"></button>
    </div>`
    el.addEventListener('click', ev => navto(`#artists/${d.artist}`))
    el.querySelector('button.batch-add').addEventListener('click', ev => {
      fetch(`/api/list/songs/${d.artist}`).then(res => res.json()).then(data => {
        data.forEach(song => audio.push(song))
      })
      ev.stopPropagation()
    })
  })
  //$('.artist img').forEach(el => lazyloader.observe(el))
}
let render_albums = (data, artist) => {
  render_generic(data, 'album', (el, d) => {
    el.innerHTML = `
    <img data-src="/art/${d.artist}/${d.album}/300" aria-label="${d.album} cover">
    <div class="bar">
      <span>${d.album}</span>
      <span class="small">${d.artist}</span>
      <button class="batch-add"></button>
    </div>`
    el.addEventListener('click', ev => navto(`#albums/${d.artist}/${d.album}`))
    el.querySelector('button.batch-add').addEventListener('click', ev => {
      fetch(`/api/list/songs/${d.artist}/${d.album}`).then(res => res.json()).then(data => {
        data.forEach(song => audio.push(song))
      })
      ev.stopPropagation()
    })
    lazyloader.observe(el.firstElementChild)
  })
  if (artist) {
    let a = $.create('span')
    a.append(document.createTextNode(artist))
    main.prepend(a)
  }
}

let render_songs = (data, art) => {
  render_generic(data, 'song', (el, d) => {
    el.innerHTML = `
    ${art?'<!--':''}
    <img data-src="/art/${d.artist}/${d.album}/100" aria-label="${d.album} cover">
    ${art?'-->':''}
    <div class="bar">
      <span>${d.song}</span>
      <span class="small">${d.artist} &bull; ${displayTime(d.duration)}</span>
    </div>`
    el.addEventListener('click', ev => audio.push({...d}))
    if (!art) lazyloader.observe(el.firstElementChild)
  })
  if (art) {
    let a = $.create('img')
    a.src = `/art/${art[0]}/${art[1]}/500`
    let b = $.create('button')
    b.className = 'batch-add'
    b.addEventListener('click', ev => $('main .song').forEach(el => audio.push({...el.meta})))
    let c = $.create('span')
    c.append(document.createTextNode(art[1]))
    main.prepend(c)
    main.prepend(b)
    main.prepend(a)
  }
}

let nav_artists = (hpath, cb) => {
  $('header nav ul li').forEach(el => el.className = '')
  $('header nav ul li#artist-tab')[0].className = 'active'
  if (hpath.length) {
    fetch(`/api/list/albums/${hpath.join('/')}`).then(res => res.json()).then(data => {
      cb(render_albums(data, data[0].artist))
    })
  } else {
    fetch('/api/list/artists').then(res => res.json()).then(data => cb(render_artists(data)))
  }
}

let nav_albums = (hpath, cb) => {
  $('header nav ul li').forEach(el => el.className = '')
  $('header nav ul li#album-tab')[0].className = 'active'
  if (hpath.length) {
    fetch(`/api/list/songs/${hpath.join('/')}`).then(res => res.json()).then(data => {
      cb(render_songs(data, [data[0].artist, data[0].album]))
    })
  } else {
    fetch('/api/list/albums').then(res => res.json()).then(data => cb(render_albums(data)))
  }
}

let nav_songs = (hpath, cb) => {
  $('header nav ul li').forEach(el => el.className = '')
  $('header nav ul li#song-tab')[0].className = 'active'
  fetch('/api/list/songs').then(res => res.json()).then(data => cb(render_songs(data)))
}

let queue_push = song => {
  let item = $.create('div')
  item.className = 'song'
  item.meta = song
  item.innerHTML = `
    <img src="/art/${song.artist}/${song.album}/100" aria-label="${song.album} cover">
    <div class="bar">
      <span>${song.song}</span>
      <span class="small">${song.artist} &bull; ${displayTime(song.duration)}</span>
    </div>
    <button class="remove" aria-label="Remove from queue"></button>
  `
  $('#queue')[0].appendChild(item)
  item.addEventListener('click', ev => {
    audio.set(song)
    audio.play()
  })
  item.lastElementChild.addEventListener('click', ev => {
    audio.delete(song)
    item.remove()
    ev.stopPropagation()
  })
}

let build_queue = () => {
  let queue = $('#queue')[0]
  while (queue.lastChild && queue.lastChild.id != 'queue-manager')
    queue.removeChild(queue.lastChild)
  audio.queue.forEach(queue_push)
  $('#queue .song').forEach(el => el.className = el.meta == audio.active ? 'song active' : 'song')
}

$('#queue-manager .shuffle')[0].addEventListener('click', ev => {
  let a = audio.queue
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  let i = a.indexOf(audio.active)
  if (i >= 0) {
    [a[i], a[0]] = [a[0], a[i]]
  }
  build_queue()
})

$('#queue-manager .clear')[0].addEventListener('click', ev => {
  $('#queue .song').forEach(song => {
    if (song.meta != audio.active) {
      audio.delete(song.meta)
      song.remove()
    }
  })
})

$('header nav ul li[data-page]').forEach(el => {
  el.addEventListener('click', ev => {
    let hash = `#${el.attributes['data-page'].value}`
    if (window.location.hash != hash) navto(hash)
  })
})

// Navigation logic
let pop_handler = ev => {
  let scroller = (ev && ev.state && ev.state.scroll) ? (() => {
    document.documentElement.scrollTop = ev.state.scroll
  }) : (() => {})
  let hashpath = window.location.hash.split('/').filter(x => x)
  ;(({
    '#artists': nav_artists,
    '#albums': nav_albums,
    '#songs': nav_songs
  })[hashpath[0]] || (() => {}))(hashpath.slice(1), scroller)
}
$('#back-button')[0].addEventListener('click', ev => {
  while (main.lastChild) main.removeChild(main.lastChild)
  history.back()
})

window.addEventListener('popstate', pop_handler)
pop_handler()

if (!window.location.hash) {
  history.replaceState(undefined, undefined, '#albums')
  pop_handler()
}

// Register functions for OS media controls (like Android lockscreen player controls)
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', ()=>{ audio.play() })
  navigator.mediaSession.setActionHandler('pause', ()=>{ audio.pause() })
  navigator.mediaSession.setActionHandler('previoustrack', ()=>{ audio.prev() })
  navigator.mediaSession.setActionHandler('nexttrack', ()=>{ audio.next() })
}

// Load the service worker for caching offline things
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}

// All of this is just to give the player a tracking-swipe animation
playerBar.addEventListener('touchstart', ev => {
  player.touchStartAbs = ev.touches[0].clientY
  player.touchOffset = player.getBoundingClientRect().top - ev.touches[0].clientY
  player.maxOffset = window.innerHeight - playerBar.clientHeight
  player.style.transition = 'none'
}, { passive: true })

playerBar.addEventListener('touchmove', ev => {
  let offset = Math.min(Math.max(0, ev.touches[0].clientY + player.touchOffset), player.maxOffset)
  player.style.transform = `translateY(${offset}px)`
}, { passive: true })

playerBar.addEventListener('touchend', ev => {
  player.style.transition = ''
  let diffMin = window.innerHeight / 10
  let diff = ev.changedTouches[0].clientY - player.touchStartAbs
  if (diff < -diffMin) body.setAttribute('data-player', 'open')
  if (diff > diffMin) body.setAttribute('data-player', 'closed')
  player.style.transform = ''
}, { passive: true })

// Save and restore player queue between loads
window.addEventListener('unload', ev => {
  localStorage.setItem('queue', JSON.stringify(audio.queue))
  localStorage.setItem('active', audio.queue.indexOf(audio.active))
  localStorage.setItem('position', audio.currentTime)
})

try {
  audio.queue = JSON.parse(localStorage.getItem('queue')) || []
  build_queue()
  let pos = +localStorage.getItem('position')
  audio.set(audio.queue[+localStorage.getItem('active')])
  audio.currentTime = pos
  localStorage.setItem('position', audio.currentTime)
  player.className = ''
} catch {}
