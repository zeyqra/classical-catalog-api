import { readdir } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { parseFile } from 'music-metadata'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

const metaflacPath = path.join(
  process.cwd(),
  'tools',
  'metaflac',
  'metaflac.exe'
)

const port = Number(process.env.PORT ?? 3000)
const app = new Hono()
const musicDirectory = 'D:\\Desktop\\参考'

type TrackIndex = {
  track: number
  composer: string
  work: string
  performers: string[]
}

type AlbumIndex = {
  fileName: string
  filePath: string
  series: string
  album: string
  tracks: TrackIndex[]
}

const albumIndex: AlbumIndex[] = []

const readAlbum = async (
  series: string,
  fileName: string,
  filePath: string
) => {
  const metadata = await parseFile(filePath)
  const tags = metadata.native.vorbis

  const getTag = (name: string) =>
    tags?.find(tag => tag.id === name)?.value ?? ''

  const trackTotal = metadata.common.track.of ?? 0

  const tracks: TrackIndex[] = []

  for (let i = 1; i <= trackTotal; i++) {
    const index = String(i).padStart(2, '0')
    const prefix = `CUE_TRACK${index}`

    const performers = [
      getTag(`${prefix}_CONDUCTOR`),
      getTag(`${prefix}_ORCHESTRA`),
      getTag(`${prefix}_SOLOIST`),
    ].filter(Boolean)

    tracks.push({
      track: i,
      composer: getTag(`${prefix}_COMPOSER`),
      work: getTag(`${prefix}_WORK`),
      performers,
    })
  }

  return {
    fileName,
    filePath,
    series,
    album: metadata.common.album ?? '',
    tracks,
  }
}

const buildIndex = async () => {
  albumIndex.length = 0

  const seriesEntries = await readdir(musicDirectory, {
    withFileTypes: true,
  })

  for (const seriesEntry of seriesEntries) {
    if (!seriesEntry.isDirectory()) continue

    const series = seriesEntry.name
    const seriesPath = path.join(musicDirectory, series)

    const files = await readdir(seriesPath, {
      withFileTypes: true,
    })

    for (const file of files) {
      if (
        !file.isFile() ||
        !file.name.toLowerCase().endsWith('.flac')
      ) {
        continue
      }

      const filePath = path.join(seriesPath, file.name)

      const album = await readAlbum(series, file.name, filePath)

      albumIndex.push(album)
    }
  }
}

await buildIndex()

app.get('/series', c => {
  const series = [
    ...new Set(albumIndex.map(album => album.series)),
  ]

  return c.json(series)
})

app.get('/albums', c => {
  const series = c.req.query('series')

  const albums = albumIndex
    .filter(album => !series || album.series === series)
    .sort((a, b) => a.fileName.localeCompare(b.fileName))

  const composerMap = new Map<string, Set<string>>()
  const performerMap = new Map<string, Set<string>>()

  for (const album of albums) {
    for (const track of album.tracks) {
      const workKey = `${album.fileName}|${track.work}`

      if (track.composer) {
        if (!composerMap.has(track.composer)) {
          composerMap.set(track.composer, new Set())
        }

        if (track.work) {
          composerMap.get(track.composer)!.add(workKey)
        }
      }

      for (const performer of track.performers) {
        if (!performerMap.has(performer)) {
          performerMap.set(performer, new Set())
        }

        if (track.work) {
          performerMap.get(performer)!.add(workKey)
        }
      }
    }
  }

  const composers = [...composerMap.entries()]
    .map(([name, workKeys]) => ({
      name,
      workCount: workKeys.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const performers = [...performerMap.entries()]
    .map(([name, workKeys]) => ({
      name,
      workCount: workKeys.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return c.json({
    albums: albums.map(album => ({
      fileName: album.fileName,
      album: album.album,
      series: album.series,
      coverUrl: `/albums/${encodeURIComponent(album.fileName)}/cover`,
    })),
    stats: {
      composers,
      performers,
    },
  })
})

app.get('/albums/:fileName', async c => {
  const fileName = c.req.param('fileName')

  const album = albumIndex.find(
    album => album.fileName === fileName
  )

  if (!album) {
    return c.notFound()
  }

  const metadata = await parseFile(album.filePath)
  const tags = metadata.native.vorbis

  const getTag = (name: string) =>
    tags?.find(tag => tag.id === name)?.value ?? ''

  const trackTotal = metadata.common.track.of ?? 0

  const tracks = []

  for (let i = 1; i <= trackTotal; i++) {
    const index = String(i).padStart(2, '0')
    const prefix = `CUE_TRACK${index}`

    tracks.push({
      track: i,
      composer: getTag(`${prefix}_COMPOSER`),
      work: getTag(`${prefix}_WORK`),
      performers: {
        conductor: getTag(`${prefix}_CONDUCTOR`),
        orchestra: getTag(`${prefix}_ORCHESTRA`),
        soloist: getTag(`${prefix}_SOLOIST`),
      },
      year: getTag(`${prefix}_YEAR`),
      movement: getTag(`${prefix}_MOVEMENT`),
    })
  }

  const composers = []

  for (const track of tracks) {
    let composer = composers.find(
      item => item.name === track.composer
    )

    if (!composer) {
      composer = {
        name: track.composer,
        works: [],
      }

      composers.push(composer)
    }

    let work = composer.works.find(
      item => item.title === track.work
    )

    if (!work) {
      work = {
        title: track.work,
        performers: {
          conductor: track.performers.conductor,
          orchestra: track.performers.orchestra,
          soloist: track.performers.soloist,
        },
        year: track.year,
        movements: [],
      }

      composer.works.push(work)
    }

    work.movements.push({
      title: track.movement,
      track: track.track,
    })
  }

  return c.json({
    title: getTag('ALBUM'),
    comment: getTag('COMMENT'),
    composers,
    coverUrl: `/albums/${encodeURIComponent(fileName)}/cover`,
    tracks,
  })
})

app.get('/albums/:fileName/cover', async c => {
  const fileName = c.req.param('fileName')

  const album = albumIndex.find(
    album => album.fileName === fileName
  )

  if (!album) {
    return c.notFound()
  }

  const metadata = await parseFile(album.filePath)
  const picture = metadata.common.picture?.[0]

  if (!picture) {
    return c.notFound()
  }

  return new Response(picture.data, {
    headers: {
      'Content-Type': picture.format,
    },
  })
})

app.put('/albums/:fileName', async c => {
  const fileName = c.req.param('fileName')

  const album = albumIndex.find(
    album => album.fileName === fileName
  )

  if (!album) {
    return c.notFound()
  }

  const data = await c.req.json()

  const args: string[] = [
    '--remove-tag=ALBUM',
    '--remove-tag=COMMENT',
  ]

  for (const track of data.tracks) {
    const index = String(track.track).padStart(2, '0')
    const prefix = `CUE_TRACK${index}`

    args.push(
      `--remove-tag=${prefix}_COMPOSER`,
      `--remove-tag=${prefix}_WORK`,
      `--remove-tag=${prefix}_CONDUCTOR`,
      `--remove-tag=${prefix}_ORCHESTRA`,
      `--remove-tag=${prefix}_SOLOIST`,
      `--remove-tag=${prefix}_YEAR`,
      `--remove-tag=${prefix}_MOVEMENT`
    )
  }

  if (data.title) {
    args.push(`--set-tag=ALBUM=${data.title}`)
  }

  if (data.comment) {
    args.push(`--set-tag=COMMENT=${data.comment}`)
  }

  for (const track of data.tracks) {
    const index = String(track.track).padStart(2, '0')
    const prefix = `CUE_TRACK${index}`

    if (track.composer) {
      args.push(`--set-tag=${prefix}_COMPOSER=${track.composer}`)
    }

    if (track.work) {
      args.push(`--set-tag=${prefix}_WORK=${track.work}`)
    }

    if (track.performers?.conductor) {
      args.push(
        `--set-tag=${prefix}_CONDUCTOR=${track.performers.conductor}`
      )
    }

    if (track.performers?.orchestra) {
      args.push(
        `--set-tag=${prefix}_ORCHESTRA=${track.performers.orchestra}`
      )
    }

    if (track.performers?.soloist) {
      args.push(
        `--set-tag=${prefix}_SOLOIST=${track.performers.soloist}`
      )
    }

    if (track.year) {
      args.push(`--set-tag=${prefix}_YEAR=${track.year}`)
    }

    if (track.movement) {
      args.push(`--set-tag=${prefix}_MOVEMENT=${track.movement}`)
    }
  }

  args.push(album.filePath)

  await execFileAsync(metaflacPath, args)

  const updatedAlbum = await readAlbum(
    album.series,
    album.fileName,
    album.filePath
  )

  const index = albumIndex.indexOf(album)
  albumIndex[index] = updatedAlbum

  return c.json({ success: true })
})

serve({
  fetch: app.fetch,
  port,
})
