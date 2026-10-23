import assert from 'node:assert/strict'
import {readFile,readdir,stat} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../dist/weapp/',import.meta.url))
const readJSON=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'))
const app=await readJSON('app.json'),theme=await readJSON(app.themeLocation)
assert.equal(app.lazyCodeLoading,'requiredComponents','Enable component code injection on demand')
if(app.tabBar.custom)for(const ext of ['.js','.json','.wxml','.wxss'])await stat(path.join(root,'custom-tab-bar/index'+ext))
const subpackages=app.subPackages||app.subpackages||[]
const routes=[...app.pages,...subpackages.flatMap(p=>p.pages.map(page=>`${p.root}/${page}`))]
for(const route of routes)for(const ext of ['.js','.json','.wxml'])await stat(path.join(root,route+ext))
for(const page of app.tabBar.list){
 assert(app.pages.includes(page.pagePath),`Tab route missing: ${page.pagePath}`)
 assert.equal((await readJSON(page.pagePath+'.json')).navigationStyle,'custom')
}
for(const palette of Object.values(theme))for(const [key,value] of Object.entries(palette)){
 if(/Icon$|Active$/.test(key))await stat(path.join(root,value))
}
const css=await readFile(path.join(root,'app-origin.wxss'),'utf8')
const selectors=css.match(/[^{}]+(?=\{)/g)||[]
assert(selectors.every(selector=>!selector.includes('*')),'WXSS cannot rely on universal selectors for native controls')
const source=await readFile(new URL('../src/ui/artwork.ts',import.meta.url),'utf8')
for(const [,file] of source.matchAll(/'(\/assets\/[^']+\.png)'/g)){
 const prefixes=file.endsWith('/milestone-rosette.png')?['packages/account','packages/tasks']:['']
 for(const prefix of prefixes)await stat(path.join(root,prefix+file))
 if(prefixes[0])await assert.rejects(stat(path.join(root,file)),{code:'ENOENT'},`Subpackage artwork leaked into main: ${file}`)
}
const icons=JSON.parse(await readFile(new URL('../src/ui/icon-paths.json',import.meta.url),'utf8'))
for(const name of Object.keys(icons))for(const scheme of ['light','dark'])for(const tone of ['ink','muted','iris','teal','apricot'])await stat(path.join(root,`assets/ui-icons/${name}-${tone}-${scheme}.png`))
for(const scheme of ['light','dark'])for(const accent of ['iris','teal','apricot']){
 const file=`assets/ui-icons/checkin-connection-${accent}-${scheme}.png`
 await stat(path.join(root,file))
 await assert.rejects(stat(path.join(root,'packages/account',file)),{code:'ENOENT'},`Shared heart should not be duplicated in account package: ${file}`)
}
let main=0,total=0,inlineImages=0
const packages=new Map(subpackages.map(p=>[p.root,0]))
async function inspect(dir){
 for(const item of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,item.name)
  if(item.isDirectory()){await inspect(file);continue}
  const relative=path.relative(root,file).split(path.sep).join('/'),size=(await stat(file)).size
  total+=size
  const packageRoot=[...packages.keys()].find(p=>relative.startsWith(p+'/'))
  if(packageRoot)packages.set(packageRoot,packages.get(packageRoot)+size);else main+=size
  if(item.name.endsWith('.js'))inlineImages+=(await readFile(file,'utf8')).match(/data:image\//g)?.length||0
 }
}
await inspect(root)
assert.equal(inlineImages,0,'Illustrations must be packaged files, not base64 in runtime data')
assert(main<1_500_000,`Main package must be below 1.5 MB (1,500,000 bytes): ${main}`)
for(const [name,size]of packages)assert(size<2*1024*1024,`Subpackage ${name} exceeds 2 MiB: ${size}`)
assert(total<20*1024*1024,`Total package exceeds 20 MiB: ${total}`)
console.log(JSON.stringify({routes:routes.length,tabs:app.tabBar.list.length,mainBytes:main,subpackageBytes:Object.fromEntries(packages),totalBytes:total,inlineImages},null,2))
