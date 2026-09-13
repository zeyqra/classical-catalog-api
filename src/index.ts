import { readdir } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { parseFile } from 'music-metadata'

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
    tags?.find(tag => tag.id === name && tag.value)?.value

  const tracks = []
  for (let i = 1; i <= 99; i++) {
    const index = String(i).padStart(2, '0')
    const work = getTag(`CUE_TRACK${index}_WORK`)
    if (!work) break

    tracks.push({
      track: i,
      composer: getTag(`CUE_TRACK${index}_COMPOSER`),
      work,
      performer: {
        conductor: getTag(`CUE_TRACK${index}_CONDUCTOR`),
        orchestra: getTag(`CUE_TRACK${index}_ORCHESTRA`),
        soloist: getTag(`CUE_TRACK${index}_SOLOIST`),
      },
      year: getTag(`CUE_TRACK${index}_YEAR`),
      movement: getTag(`CUE_TRACK${index}_MOVEMENT`),
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
        recording: {
          conductor: track.performer.conductor,
          orchestra: track.performer.orchestra,
          soloist: track.performer.soloist,
          year: track.year,
        },
        movements: [],
      }
      composer.works.push(work)
    }
    work.movements.push(track.movement)
  }

  return c.json({
    title: getTag('ALBUM'),
    comment: getTag('COMMENT'),
    composers,
    coverUrl: `/albums/${encodeURIComponent(fileName)}/cover`,
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

serve({
  fetch: app.fetch,
  port,
})
