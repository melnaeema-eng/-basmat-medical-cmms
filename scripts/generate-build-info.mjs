import {execSync} from 'node:child_process'
import {writeFileSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const root=resolve(here,'..')
let commit='unknown'
let branch='unknown'
try{commit=execSync('git rev-parse --short HEAD',{cwd:root,encoding:'utf8'}).trim()}catch{}
try{branch=execSync('git rev-parse --abbrev-ref HEAD',{cwd:root,encoding:'utf8'}).trim()}catch{}
const builtAt=new Date().toISOString()
const out=resolve(root,'src/generated/buildInfo.js')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,
`export const BUILD_INFO=${JSON.stringify({commit,branch,builtAt})}\n`,
'utf8')
console.log(`Build info: ${branch}@${commit}`)
