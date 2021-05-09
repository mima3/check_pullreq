// このコードは以下を参考に作成されています。
// https://github.com/ralphtheninja/await-spawn/blob/master/index.js
// 元のコードでは正常終了の際にstderrの出力を握り潰すため、jestで--jsonを指定した場合に正常に出力されていません。
const { spawn } = require('child_process')
const BufferList = require('bl')

module.exports = (...args) => {
  const child = spawn(...args)
  const stdout = child.stdout ? new BufferList() : ''
  const stderr = child.stderr ? new BufferList() : ''

  if (child.stdout) {
    child.stdout.on('data', data => {
      stdout.append(data)
    })
  }

  if (child.stderr) {
    child.stderr.on('data', data => {
      stderr.append(data)
    })
  }

  const promise = new Promise((resolve, reject) => {
    child.on('error', reject)

    child.on('close', code => {
      const obj = {
        code: code,
        stderr: stderr,
        stdout: stdout
      }
      if (code === 0) {
        resolve(obj)
      } else {
        reject(obj)
      }
    })
  })

  promise.child = child

  return promise
}
