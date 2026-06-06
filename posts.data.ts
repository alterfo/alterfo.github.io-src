import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

interface Post {
  title: string
  url: string
  date: {
    time: number
    string: string
  }
}

function buildPost(file: string, postsDir: string): Post {
  const raw = readFileSync(join(postsDir, file), 'utf-8')
  const { data: fm } = matter(raw)
  const date = new Date(fm.date as string)
  date.setUTCHours(12)
  return {
    title: fm.title as string,
    url: '/posts/' + file.replace(/\.md$/, ''),
    date: {
      time: +date,
      string: date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    },
  }
}

function loadPosts(): Post[] {
  const postsDir = join(__dirname, 'posts')
  return readdirSync(postsDir)
    .filter((f: string) => f.endsWith('.md'))
    .map((file: string) => buildPost(file, postsDir))
    .sort((a: Post, b: Post) => b.date.time - a.date.time)
}

declare const data: Post[]
export { data }

export default {
  watch: ['posts/*.md'],
  async load(): Promise<Post[]> {
    return loadPosts()
  },
}
