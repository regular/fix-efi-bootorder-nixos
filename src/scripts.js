const {spawn} = require('child_process')
const bl = require('bl')
const {join} = require('path')

const PKG_DEPS = 'awk grep lsblk efibootmgr'

module.exports = function(env) {
  return {
    getBootPartition,
    efibootmgr
  }

  function getBootPartition() {
    return simpleScript('get-boot-partition.sh')
  }

  function efibootmgr(args = null) {
    return simpleScript('efibootmgr.sh', null, args)
  }

  async function simpleScript(scriptName, mapping, extraArgs = [], opts = {}) {
    opts = opts || {}
    mapping = mapping || {stdout: 1}
    const quiet = opts.quiet || false
    const q = quiet ? 'ignore' : 'inherit'
    const script = join(__dirname, scriptName)

    const fds = Object.values(mapping)
    const maxFd = Math.max.apply(Math, fds)
    const stdio = new Array(Math.max(maxFd + 1, 3)).fill(q)
    fds.forEach(n=>stdio[n] = 'pipe')

    const p = spawn(env.shell || '/bin/sh', ['-euo', 'pipefail', script].concat(extraArgs), {
      env,
      stdio
    })

    const done = new Promise( (resolve, reject) => {
      p.on('close', exitCode=>{
        if (exitCode == 0) return resolve({})
        return reject(new Error(`${scriptName} exit code: ${exitCode}`))
      })
    })

    return capture(p, mapping, [done])
  }
}

// capture output on a number of file descriptors and
// return them in an object.
// mapping is  key => fd number
async function capture(p, mapping, extraPromises) {
  function captureFD(n, name) {
    return new Promise( (resolve, reject)=>{
      p.stdio[n].pipe(bl( (err, data)=>{
        if (err) return reject(err)
        resolve({[name]: data.toString().trim()})
      })) 
    })
  }

  const objs = await Promise.all(Object.entries(mapping).map( ([name, fd]) => {
    return captureFD(fd, name)
  }).concat(extraPromises))

  return Object.assign.apply(Object, objs)
}

module.exports.deps = PKG_DEPS.split(' ')
