process.stdin.resume();
process.stdin.setEncoding('utf8');

let fragment = '';
const result = []
process.stdin.on('data', function(chunk){
  if (chunk == '') { return ;}
  var lines = chunk.split('\n');
  lines[0] = fragment + lines[0];
  fragment = lines.pop();
  lines.forEach(function(line){
    const item = {
      path: '',
      line: 0,
      column: 0,
      word: ''
    };
    item.path = line.substr(0, line.indexOf(':'));

    line = line.substr(line.indexOf(':')+1)
    const locations = line.substr(0, line.indexOf(' - ')).split(':')
    item.line = Number(locations[0]);
    item.column = Number(locations[1]);

    line = line.substr(line.indexOf(' - ')+1)
    item.word = line.match(/\((.+)\)/)[1]
    result.push(item)
  });
});
 
process.stdin.on('end', function(){
  console.log(JSON.stringify(result, null, 2))
});