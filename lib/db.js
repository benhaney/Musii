const Sqlite = require('better-sqlite3')
const path = require('path')
const fs = require('fs').promises
const mm = require('music-metadata')

async function* walk(inode, opts = {}) {
  let stats = await fs.stat(inode)
  if (stats.isDirectory()) {
    const subnodes = await fs.readdir(inode)
    for (const subnode of subnodes) {
      yield* walk(path.join(inode, subnode), opts)
    }
  } else {
    if (stats.mtimeMs < (opts.time || 0)) return
    if (path.basename(inode).startsWith('.')) return
    yield inode
  }
}

function Database(file) {
  this.db = new Sqlite(file)

  this.db.prepare(`create table if not exists songs (
    path text primary key,
    song text not null,
    album text not null,
    artist text not null,
    duration integer not null,
    track integer,
    genre text
  )`).run()
  this.db.prepare(`create table if not exists art (
    artist text not null,
    album text not null,
    path text not null,
    primary key (artist, album)
  )`).run()
  this.db.prepare(`create table if not exists meta (
    key text primary key,
    value text
  )`).run()
}

Database.prototype.update = async function(dir) {
  let last_update = (this.db.prepare(`
    select value from meta where key='last_update'
  `).get() || { value: 0 })["value"]

  let song_stmt = this.db.prepare(`insert into 
    songs (path, song, album, artist, duration, track, genre)
    values (?, ?, ?, ?, ?, ?, ?)
    on conflict (path) do update set
      song=excluded.song,
      album=excluded.album,
      artist=excluded.artist,
      duration=excluded.duration,
      track=excluded.track,
      genre=excluded.genre
  `)

  let art_stmt = this.db.prepare(`insert into 
    art (artist, album, path)
    values (?, ?, ?)
    on conflict (artist, album) do update set
      path=excluded.path
  `)

  for await (let file of walk(dir, {time: last_update})) {
    let rel = path.relative(dir, file)
    mm.parseFile(file).then(m => {
      song_stmt.run(
        rel,
        m.common.title,
        m.common.album,
        m.common.artist,
        m.format.duration,
        m.common.track.no,
        m.common.genre
      )
      //console.log(`Updated ${m.common.title}`)
    }).catch(async err => {
      // This is probably cover art
      if (!['.png', '.jpg', '.jpeg'].includes(path.extname(file).toLowerCase())) return
      for await (let f of walk(path.dirname(file))) {
        try {
          let m = await mm.parseFile(f)
          art_stmt.run(m.common.artist, m.common.album, rel)
          break
        } catch {}
      }
    })
  }
  this.db.prepare(`insert into meta (key, value) values ('last_update', ?)
    on conflict (key) do update set value=excluded.value
  `).run(`${Date.now()}`)
}

Database.prototype.list = function(type, artist, album) {
  if (type == 'artists')
    return this.db.prepare(`
      select distinct artist from songs
      order by artist asc
    `).all()
  else if (type == 'albums')
    return this.db.prepare(`
      select distinct artist, album from songs
      ${artist ? 'where artist = ?' : ''}
      order by album asc
    `).all(...[artist].filter(x => x))
  else if (type == 'songs')
    return this.db.prepare(`
      select song, artist, album, track, duration from songs
      ${artist ? 'where artist = ?' : ''}
      ${album ? 'and album = ?' : ''}
      order by ${album?'track':'song'} asc
    `).all(...[artist, album].filter(x => x))
}

Database.prototype.art = function(artist, album) {
  return (this.db.prepare(`select path from art where artist = ? and album = ?`).get(artist, album) || {path: false}).path
}

Database.prototype.audio = function(song, album, artist) {
  return (this.db.prepare(`
    select path from songs where
      song = ?
      ${album ? 'and album = ?' : ''}
      ${artist ? 'and artist = ?' : ''}
  `).get(...[song, album, artist].filter(x => x)) || {path: false}).path
}

module.exports = Database
