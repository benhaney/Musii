# Musii

A self-hosted personal music streaming service

<img src="https://cdn-a.benhaney.com/r/179bd3c4.gif">

## Features

* Server-side music library indexing
* Server-side album art downscaling and music encoding for lower bandwidth usage (lossless -> 128kbps ogg)
* Mobile-first progressive web app with native app experience
* Artist, Album, and Song views
* Queue management
* Android integration (notification and lockscreen album art and media controls)

## Configuration

The following environment variables can be set to configure the application

| Name            | Default         | Description                    |
|-----------------|-----------------|--------------------------------|
| MUSII_MUSIC_DIR | ~/Music/        | Path to music library          |
| MUSII_CACHE_DIR | ~/.cache/musii/ | Path to musii cache directory  |
| MUSII_MUSIC_DB  | ./songs.db      | Path to database file location |
