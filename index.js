const path = require('path')
const Database = require('./lib/db')
const express = require('express')
const fs = require('fs').promises
fs.createReadStream = require('fs').createReadStream
const { exec, spawn } = require('child_process')
const mm = require('music-metadata')
const app = express()

app.disable('x-powered-by')
app.use(express.json())

let config = {
  "music-dir": process.env["MUSII_MUSIC_DIR"] || path.join(process.env.HOME, "Music/"),
  "cache-dir": process.env["MUSII_CACHE_DIR"] || path.join(process.env.HOME, ".cache/musii/"),
  "db-file":   process.env["MUSIC_MUSIC_DB"]  || "songs.db"
}

let db = new Database(config["db-file"])
db.update(config["music-dir"])

let resize_img = (src, dest, size) => {
  spawn('convert', [
    src, '-resize', `${size}x${size}`,
    '-strip', '-interlace', 'Plane',
    '-quality', '80', dest
  ])
}

let compression_queue = []
let compressing = false
let compress_audio = (src, dest) => {
  compression_queue.push([src, dest])
  let comp = () => {
    let [src, dest] = compression_queue.splice(0,1)[0] || []
    if (!src || !dest) return
    fs.access(dest).then(comp).catch((err) => {
      compressing = true
      spawn('ffmpeg', [
        '-n', '-i', src,
        '-vn', '-c:a', 'libopus', '-b:a', '128K',
        `${dest}.partial.ogg`
      ]).on('exit', code => {
        if (!code) fs.rename(`${dest}.partial.ogg`, dest)
        compressing = false
        comp()
      }).on('error', console.error)
    })
  }
  if (!compressing) comp()
}

app.get('/', (req, res) => {
  res.type('html')
  res.set('Link', ['/css/style.css; rel=preload; as=style', '/js/main.js; rel=preload; as=script'])
  fs.readFile('public/index.html').then(index => res.end(index.toString()))
})

app.get('/api/list/:type/:artist?/:album?', (req, res) => {
  res.json(db.list(req.params.type, req.params.artist, req.params.album))
})

app.get('/art/:artist/:album?/:size?', (req, res) => {
  let file = db.art(req.params.artist, req.params.album)
  if (!file) return res.status(404).end()
  res.type(path.extname(file))
  let path_orig = path.join(config["music-dir"], file)
  if (req.params.size) {
    fs.mkdir(path.join(config["cache-dir"], 'art'), { recursive: true })
    let path_cached = path.join(config["cache-dir"], 'art', `${req.params.artist} - ${req.params.album} x${req.params.size}.jpg`)
    fs.readFile(path_cached)
      .then(data => {
        res.set('Cache-Control', 'max-age=604800')
        res.end(data)
      })
      .catch(err => {
        try {
          fs.createReadStream(path_orig).pipe(res)
        } catch (err) {
          console.log('Error getting original album art', err)
        }
        resize_img(path_orig, path_cached, req.params.size)
      })
  } else {
    fs.createReadStream(path_orig).pipe(res)
  }
})

// TODO: DRY up these next two endpoints
app.get('/hint/audio/:song/:album/:artist', (req, res) => {
  let file = db.audio(req.params.song, req.params.album, req.params.artist)
  if (!file) return res.status(404).end()
  let path_orig = path.join(config["music-dir"], file)
  fs.mkdir(path.join(config["cache-dir"], 'audio'), { recursive: true })
  let path_cached = path.join(config["cache-dir"], 'audio', `${req.params.artist} - ${req.params.album} - ${req.params.song}.ogg`)
  fs.access(path_cached).then(() => res.status(200).end()).catch(() => {
    if (['.flac', '.wav'].includes(path.extname(path_orig))) {
      compress_audio(path_orig, path_cached)
      res.status(201).end()
    } else { res.status(200).end() }
  })
})

app.get('/audio/:song/:album/:artist', (req, res) => {
  let file = db.audio(req.params.song, req.params.album, req.params.artist)
  if (!file) return res.status(404).end()
  let path_orig = path.join(config["music-dir"], file)
  fs.mkdir(path.join(config["cache-dir"], 'audio'), { recursive: true })
  let path_cached = path.join(config["cache-dir"], 'audio', `${req.params.artist} - ${req.params.album} - ${req.params.song}.ogg`)
  fs.access(path_cached).then(() => path_cached).catch(() => {
    if (['.flac', '.wav'].includes(path.extname(path_orig))) {
      compress_audio(path_orig, path_cached)
      res.set('Cache-Control', 'no-store')
    }
    return path_orig
  }).then(path_use => {
    res.set('accept-ranges', 'bytes')
    res.type(path.extname(path_use))
    if (!req.headers.range) {
      return fs.createReadStream(path_use).pipe(res)
    }
    fs.stat(path_use).then(stats => {
      let range = req.headers.range.split('=')[1]
      range = [parseInt(range), parseInt(range.slice((parseInt(range)+'').length+1))]
      //if (range[0] > stats.size - 1) return res.status(400).end("Requested range out of bounds")
      range[0] = Math.min(stats.size - 1, range[0])
      range[1] = Math.min(stats.size - 1, isNaN(range[1]) ? Infinity : range[1])
      res.status(206)
      res.set('Content-Range', `bytes ${range[0]}-${range[1]}/${stats.size}`)
      res.set('Content-Length', range[1]-range[0]+1)
      fs.createReadStream(path_use, {start: range[0], end: range[1]}).pipe(res)
    }).catch(err => res.status(500).end(err.toString()))
  })
})
app.use('/', express.static('public'))

app.listen(8090)
