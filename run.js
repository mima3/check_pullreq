const SimpleGit = require('simple-git');
const commander = require('commander');
const GitHubCtrl = require('./GitHubCtrl');
const DiffParser = require("git-diff-parser");
const JsParser = require('./parser')

const path = require('path')
const npmPackage = require(path.join(__dirname, 'package.json'));
const fs = require('fs')
const spawn = require('./await-spawn')

function createUrl(url, user, token) {
  console.log('createUrl', url)
  return url.replace('https://', `https://${user}:${token}@`)
}

async function cSpell(target, config) {
  const out = await spawn('npx', ['cSpell',  '--wordsOnly', `--unique`, '-c', config, target]).catch(e => {
    // エラー出力で英単語の一覧が表示される
    console.error(e.stdout.toString())
    return e.stdout.toString().split('/n')
  })
  return []

}

async function jscpd(local, output) {
  const out = await spawn('npx', ['jscpd', local, '--reporters=json', `--output=${output}`, '--max-size=1Mb','--max-lines=10000']).catch(e => {
    console.error(e.stderr.toString())
  })
  if (!out) {
    return
  }
  // return JSON.parse(fs.readFileSync(path.join(output, 'jscpd-report.json'), 'utf-8'))
}

function checkJscpd(diff, jscpdReportPath) {
  const diffResult = [];
  diff.commits.forEach((commit, idx) => {
    commit.files.forEach((file, idx) => {
      let item = null
      if (file.added) return;
      if (file.deleted) return;
      if (file.binary) return;
      file.lines.forEach(function(line) {
        if (!item || line.break) {
          if (line.break) {
            if (item) {
              diffResult.push(item);
            }
            item = null
          }
          if (line.type === "added") {
            item = {
              before: {},
              after: {
                start: line.ln1,
                end: line.ln1
              }
            }
          } else if (line.type === 'deleted') {
            item = {
              before: {
                start: line.ln1,
                end: line.ln1
              },
              after: {}
            }
          } else if (line.type === 'normal') {
            item = {
              before: {
                start: line.ln1,
                end: line.ln1
              },
              after: {
                start: line.ln2,
                end: line.ln2
              }
            }
          }
          item.path = file.name
        }
        if (line.type === "added") {
          if (!item.after.start) {
            item.after.start = line.ln1;
          }
          item.after.end = line.ln1;
        } else if (line.type === 'deleted') {
          if (!item.before.end) {
            item.before.start = line.ln1;
          }
          item.before.end = line.ln1;
        } else if (line.type === 'normal') {
          item.before.end = line.ln1;
          item.after.end = line.ln2;
        }
      })
      diffResult.push(item);
    })
  }) 

  const jscpdData = JSON.parse(fs.readFileSync(jscpdReportPath, 'utf-8'));
  for (const diff of diffResult) {
    const item = jscpdData.duplicates.find((duplicate)=>{
      if (duplicate.firstFile.name.indexOf(diff.path) >= 0 &&
          duplicate.firstFile.start <= diff.before.start && 
          duplicate.firstFile.end >= diff.before.end) {
        return true;
      }
      if (duplicate.secondFile.name.indexOf(diff.path) >= 0 &&
          duplicate.secondFile.start <= diff.before.start && 
          duplicate.secondFile.end >= diff.before.end) {
        return true;
      }
      return false;
    })
    if (item) {
      console.log(`${item.firstFile.name} ${item.firstFile.start}:${item.firstFile.end}  ${item.secondFile.name} ${item.secondFile.start}:${item.secondFile.end}`)
      console.log(item.fragment)

    }
  }
}

function metrics(workDir, files) {
  const fileMetrics = [];
  files.map((file)=>{
    const item = {}
    item.functions = []
    item.maxComplex = 0
    item.maxLoc = 0
    const srcPath = path.resolve(workDir, file)
    item.path = srcPath
    if (!fs.existsSync(srcPath)) {
      console.warn('notfound', srcPath)
      return
    }
    let result = []
    if (srcPath.endsWith('.js')) {
      let src = '';
      src = fs.readFileSync(srcPath, 'utf-8');
      let parser = new JsParser(srcPath, src);
      result = result.concat(parser.analyze());
    } else if (srcPath.endsWith('.vue')) {
      let doc = fs.readFileSync(srcPath, 'utf-8');
      const offsetLine = doc.substr(0, doc.indexOf('<script>')).split('\n').length + 1;
      const srcs = doc.match(/(?<=<script>)[\s\S]*?(?=<\/script>)/g);
      if (!srcs) return;
      srcs.map((src)=>{
        let parser = new JsParser(srcPath, src);
        result = result.concat(parser.analyze(offsetLine));
      });
    } else {
      return;
    }
    let maxComplex = 0
    let maxLoc = 0
    result.map((ret)=>{
      if (maxComplex < ret.complex) {
        maxComplex = ret.complex
      }
      if (maxLoc < ret.loc) {
        maxLoc = ret.loc
      }
      item.functions.push({
        name : ret.name,
        code: ret.code,
        line: ret.line,
        complex : ret.complex,
        loc : ret.loc
      })
    })
    item.maxComplex = maxComplex
    item.maxLoc = maxLoc
    fileMetrics.push(item);
  })
  return fileMetrics
}

async function run(program, argv) {
  const prog = program || commander;
  const args = argv || process.argv;
  prog
    .command('help')
    .description('show help.')
    .action(async (repoName, pullNo) => {
      prog.help();
    })
  prog
    .command('check <repoName> <pullNo>', {isDefault: true})
    .description('check pull request.')
    .option('-c, --config <config>', 'config path.')
    .option('-o, --output <output>', 'output folder.')
    .action(async (repoName, pullNo, options) => {
      let output = './tmp'
      if (options.output) {
        output = options.output
      }
      let configPath = './pullReq.config.json'
      if (options.config) {
        configPath = options.config
      }

      const config = require(configPath)

      const ctrl = new GitHubCtrl(config.user, config.token, repoName);
      const pullReq = await ctrl.getPullRequest(pullNo);
      const root = config.root;
      // 出力フォルダの作成
      if (fs.existsSync(output)) {
        fs.rmdirSync(output, { recursive: true });
      }
      fs.mkdirSync(output, { recursive: true });
      const beforeOutput = path.join(output, 'before')
      fs.mkdirSync(beforeOutput, { recursive: true });

      const afterOutput = path.join(output, 'after')
      fs.mkdirSync(afterOutput, { recursive: true });

      // gitからcloneする
      const local = path.join(output, 'repo');
      await SimpleGit().clone(
        createUrl(pullReq.base.repo.html_url, config.user, config.token),
        local, {}
      ).catch((err)=>{
        console.error(err);
      })

      // baseの内容を取得
      const git = SimpleGit(local);
      await git.checkout(pullReq.base.sha);

      // baseのcodeクローンを検知
      await jscpd(path.join(local, root), beforeOutput).catch(err=>{
        console.error(err)
        process.exit(1)
      })

      // baseとheadのdiffの作成
      const diffStr = await git.diff([pullReq.base.sha, pullReq.head.sha]);
      fs.writeFileSync(path.join(output, 'git.patch'), diffStr);
      const diff = DiffParser(diffStr);

      // 修正前のファイルのコードクローンをチェックする
      console.log('コードクローンの修正***************')
      checkJscpd(diff, path.join(beforeOutput, 'jscpd-report.json'));

      // パッチ適用前にメトリックスの集計
      const beforeFiles = []
      diff.commits.forEach((commit, idx) => {
        commit.files.forEach((file, idx) => {
          if (file.added) return;
          if (file.deleted) return;
          if (file.binary) return;          
          beforeFiles.push(file.name)
        })
      })
      const beforeMetrics = metrics(local, beforeFiles);
      fs.writeFileSync(path.join(beforeOutput,'metrics.json'), JSON.stringify(beforeMetrics, null, 2));

      // パッチを適用
      await git.applyPatch(path.join(path.resolve(output), 'git.patch')).catch((err)=>{
        console.error(err);
      })

      // パッチ適用後にメトリックスの集計
      console.log('複雑度算出***************')
      const afterFiles = []
      diff.commits.forEach((commit, idx) => {
        commit.files.forEach((file, idx) => {
          if (file.deleted) return;
          if (file.binary) return;          
          afterFiles.push(file.name)
        })
      })
      const afterMetrics = metrics(local, afterFiles);
      fs.writeFileSync(path.join(afterOutput,'metrics.json'), JSON.stringify(afterMetrics, null, 2));

      const diffResult = [];
      diff.commits.forEach((commit, idx) => {
        commit.files.forEach((file, idx) => {
          let item = null
          if (file.binary) return;
          file.lines.forEach(function(line) {
            if (!item || line.break) {
              if (line.break) {
                if (item) {
                  diffResult.push(item);
                }
                item = null
              }
              if (line.type === "added") {
                item = {
                  before: {},
                  after: {
                    start: line.ln1,
                    end: line.ln1
                  }
                }
              } else if (line.type === 'deleted') {
                item = {
                  before: {
                    start: line.ln1,
                    end: line.ln1
                  },
                  after: {}
                }
              } else if (line.type === 'normal') {
                item = {
                  before: {
                    start: line.ln1,
                    end: line.ln1
                  },
                  after: {
                    start: line.ln2,
                    end: line.ln2
                  }
                }
              }
              item.path = file.name
            }
            if (line.type === "added") {
              if (!item.after.start) {
                item.after.start = line.ln1;
              }
              item.after.end = line.ln1;
            } else if (line.type === 'deleted') {
              if (!item.before.end) {
                item.before.start = line.ln1;
              }
              item.before.end = line.ln1;
            } else if (line.type === 'normal') {
              item.before.end = line.ln1;
              item.after.end = line.ln2;
            }
          })
          diffResult.push(item);
        })
      })

      for (const metric of afterMetrics) {
        for (let diffRet of diffResult) {
          if (metric.path.indexOf(diffRet.path) >=0) {
            for (const item of metric.functions) {
              if (item.name === 'root') continue;
              if ((item.line <= diffRet.after.start &&
                  (item.line + item.loc) >= diffRet.after.start) || 
                  (item.line <= diffRet.after.end &&
                  (item.line + item.loc) >= diffRet.after.end) ) {
                console.log(`${diffRet.path} ${item.line}:${item.line + item.loc} ${item.complex}`)
              }
            }
          }
        }
      }

      // 単語チェック
      console.log('Diffに含まれる未定義の英単語***************')
      await cSpell(path.join(output, 'git.patch'), config.cSpell)

    });

  return prog.parseAsync(args).then(() => {
    return;
  });    
}
run()