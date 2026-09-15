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
const metaflacDir = path.dirname(metaflacPath)

const port = Number(process.env.PORT ?? 3000)
const app = new Hono()
const musicDirectory = 'D:\\Desktop\\参考'

app.get('/albums', async c => {
  const entries = await readdir(musicDirectory, {
    withFileTypes: true,
  })
  const files = entries
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.flac')
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  const result = await Promise.all(
    files.map(async ({ name }) => {
      const metadata = await parseFile(
        `${musicDirectory}\\${name}`
      )

      return {
        fileName: name,
        album: metadata.common.album,
        coverUrl: `/albums/${encodeURIComponent(name)}/cover`,
      }
    })
  )

  return c.json(result)
})

app.get('/albums/:fileName', async c => {
  const fileName = c.req.param('fileName')
  const filePath = `${musicDirectory}\\${fileName}`

  const metadata = await parseFile(filePath)
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
    metadata,
    tags,
  })
})

app.get('/albums/:fileName/cover', async c => {
  const fileName = c.req.param('fileName')
  const filePath = `${musicDirectory}\\${fileName}`
  const metadata = await parseFile(filePath)
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
  const filePath = `${musicDirectory}\\${fileName}`
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

  args.push(filePath)

  await execFileAsync(metaflacPath, args)

  return c.json({ success: true })
})

serve({
  fetch: app.fetch,
  port,
})
