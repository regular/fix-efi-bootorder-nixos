const name = 'fix_efi_bootorder'
const fs = require('fs')
const {join} = require('path')
const debug = require('debug')(name)

const Scripts = require('./scripts')
const assertDeps = require('./assert-deps')

const config = require('rc')(name, {
  first: [],
})

const SYSTEMD_EFIFILENAME ="systemd-bootx64.efi"
const GRUB_EFIFILENAME = "grubx64.efi"

debug('config: %O', config)

let shell
try {
  shell = assertDeps(process.env.PATH, Scripts.deps)
} catch(err) {
  console.error(err.message)
  process.exit(1)
}

const {
  getBootPartitions,
  efibootmgr
} = Scripts({
  PATH: process.env.PATH,
  shell
})

main()

async function main() {
  if (config._.length == 1) {
    const [cmd] = config._
    try {
      if (cmd == 'inspect') {
        await inspect()
      } else if (cmd == 'fix') {
        const newOrder = (await dryRun()).join(',')
        console.log('new order:', newOrder)
        await efibootmgr(['--bootorder', newOrder])
      } else if (cmd == 'dry-run') {
        await dryRun()
      } else {
        throw new Error('missing sub-command: inspect, dry-run or fix')
      }
    } catch(err) {
      console.error(err.message)
      debug(err.stack)
      process.exit(1)
    }
  }
}

function parse(s) {
  const mc = s.match(/BootCurrent:\s*([0-9]+)/m)
  if (!mc) throw new Error('No BootCurrent')
  const current = mc[1]
  const m = s.match(/BootOrder:\s*([0-9\,]+)/m)
  if (!m) throw new Error('BootOrder not found.')
  const [_, order] = m
  const entries = order.split(',')
  //console.log('entries', entries)
  const ordered_entries = entries.map(e=>{
    //console.log(e)
    const re = `^Boot${e}(\\*)?\\s+(.*)$`
    const m = s.match(new RegExp(re,'m'))
    if (!m) throw new Error(`Boot entry ${e} not found`)
    const [_, active, content] = m;
    return {id: e, current: e == current, active, content}
  })
  return ordered_entries
}

async function getBoots() {
  let boots = await getBootPartitions()
  boots = boots.stdout.split('\n').map(l=>{
    const [uuid, mountpoint] = l.trim().split(/\s+/)
    return {uuid, mountpoint}
  })
  boots = boots.sort( (a,b)=>{
    if (a.mountpoint < b.mountpoint) return -1
    if (a.mountpoint > b.mountpoint) return 1
    return 0
  })
  return boots
}

async function flag(boots) {
  const entries = parse((await efibootmgr()).stdout)
  return entries.map( ({id, current, active, content})=>{
    const flags = []
    if (active) flags.push('active')
    if (current) flags.push('current')
    boots.forEach( ({uuid})=>{
      if (content.includes(uuid)) flags.push('boot-uuid')
    })
    if (content.includes(SYSTEMD_EFIFILENAME)) flags.push('systemd-boot')
    if (content.includes(GRUB_EFIFILENAME)) flags.push('grub')
    return {id, flags, content} 
  })
}

function ensureBootLoader(entries, bootloader, boots) {
  if (bootloader !== 'systemd-boot' && bootloader !== 'grub') throw new Error('Invalid bootloader: ' + bootloader)
  
  boots.reverse().forEach( ({uuid, mountpoint})=>{
    const f = entries.find( ({id, flags, content})=>{
      return flags.includes('active')
      && flags.includes('boot-uuid')
      && flags.includes(bootloader)
      && content.includes(uuid)
    })
    if (!f) throw new Error(`No active entry with matching partition UUID (${uuid}) and bootloader (${bootloader}) found`)
    if (f.id == entries[0].id) {
      console.log(`Entry ${f.id} boots ${bootloader} from ${uuid} (${mountpoint}) and is already the first entry`)
      return entries
    }
    console.log(`Making ${f.id} the first entry because it loads ${bootloader} from the correct ${uuid} (${mountpoint}).`)
    const newEntries = entries.filter( e=>e!==f )
    newEntries.unshift(f)
    entries = newEntries
  })
  return entries
}

function ensureFirst(entries, substr) {
  const f = entries.find( ({id, flags, content})=>{
    return flags.includes('active')
     && content.includes(substr)
  })
  if (!f) {
    const msg = `No active entry with matching substr ("${substr}") found`
    if (config['first-is-optional']) {
      console.error(msg)
      console.error('continue anyway.')
      return entries
    }
    throw new Error(msg)
  } if (f.id == entries[0].id) {
    console.log(`Entry ${f.id} contains "${substr}" and is already the first entry`)
    return entries
  }
  console.log(`Making ${f.id} the first entry because it contains sub-string "${substr}"`)
  const newEntries = entries.filter( e=>e!==f )
  newEntries.unshift(f)
  return newEntries
}

function show(entries) {
  entries.forEach( ({id, flags, content})=>{
    console.log(`${id} [${flags.join(', ')}] ${content}`)
  })
}
  
async function inspect() {
  const entries = await flag()
  show(entries)
}

async function dryRun() {
  const boots = await getBoots()
  console.log('Boot partition UUIDs are:')
  console.log(boots.map( ({mountpoint, uuid})=>{
    return `${mountpoint} ${uuid}`
  }).join('\n'))

  if (!config.bootloader) {
    throw new Error('Missing --bootloader')
  }
  const entries = await flag(boots)
  console.log('Before:')
  show(entries)
  console.log()
  let newEntries = ensureBootLoader(entries, config.bootloader, boots)
  if (config.first) {
    const substrs = [config.first].flat()
    for(const substr of substrs) {
      newEntries = ensureFirst(newEntries, substr)
    }
  }
  console.log()
  console.log('After:')
  show(newEntries)
  return newEntries.map(e=>e.id)
}
