const fs = require('fs');
const acorn = require("acorn");
const walk = require("acorn-walk")
const func_type = [
    'ArrowFunctionExpression' ,
    'FunctionDeclaration',
    'FunctionExpression'
  ];
  const inc_type = [
    'IfStatement',
    'SwitchStatement',
    'ForStatement',
    'ForOfStatement',
    'ForInStatement',
    'DoWhileStatement',
    'WhileStatement',
    'CatchClause',
    'LogicalExpression',
    'ConditionalExpression'
  ];
  const exclude_dir = [
    'dist',
    'node_modules'
  ]
  class Parser {
    constructor(file, src) {
      this.file = file;
      this.src = src;
      //console.log('Parse', file)
    }
    analyzeFuncNode(node, path, function_list) {
  
      // 関数のnode
      let func_name = '';
      if (path.length >= 2) {
        const parentNode = path[path.length - 2];
        if (node.type === 'ArrowFunctionExpression' ||
            node.type === 'FunctionDeclaration' ) {
          if (node.id && node.id.name) {
            func_name = node.id.name;
          }
        } else if (node.type === 'FunctionExpression') {
          if (parentNode.type === 'Property' || parentNode.type === 'MethodDefinition') {
            func_name = parentNode.key.name;
          }
        }
      }
      const func = function_list.find((f)=>{
        return f.node.start === node.start && f.node.end === node.end;
      });
      if (!func) {
        function_list.push(
          {
            node : node,
            name : func_name,
            complex : 1,
            loc : this.src.substr(node.start, node.end-node.start).split('\n').length,
            code : this.src.substr(node.start, node.end-node.start).replace(/\r?\n/g,"").replace(/\t?\n/g,"").slice(0, 200)
          }
        );
      }    
    }
    analyze(offsetLine) {
      if (!offsetLine) {
        offsetLine = 0
      }
      const function_list = [];
      const ast = acorn.parse(this.src, { sourceType: "module", ecmaVersion:2020});
      function_list.push({
        node : {
          start : 0,
          end : this.src.length - 1
        },
        name : "root",
        complex : 1,
        loc : this.src.substr(0, this.src.length - 1).split('\n').length,
        code : "ファイル参照"
      });
      walk.fullAncestor(ast, (node, path)=> {
        let obj = null;
        if (func_type.includes(node.type)) {
          this.analyzeFuncNode(node, path, function_list);
        } else if (node.type === 'CallExpression') {
          // 関数の引数で関数が指定された場合、fullAncestorで上がってこない。
          const funcs = node.arguments.filter((n)=> {
            return func_type.includes(n.type);
          });
          if (funcs.length > 0) {
            this.analyzeFuncNode(node, path, function_list);
          }
        }
      });
      walk.fullAncestor(ast, (node, path)=> {
        if (!inc_type.includes(node.type)) {
          return;
        }
        let pathFuncNodes = path.filter((p) => {
          if (func_type.includes(p.type)) {
            return true;
          }
          if (p.type === 'CallExpression') {
            const funcs = p.arguments.filter((n)=> {
              return func_type.includes(n.type);
            });
            if (funcs) {
              return true;
            }
          }
          return false;
        });
        if (pathFuncNodes.length == 0) {
          pathFuncNodes = [function_list[0].node];
        }
        const func = function_list.find((f)=>{
          return pathFuncNodes.find((pf)=> {
            return f.node.start === pf.start && f.node.end === pf.end;
          })
        });
        if (!func) {
          console.log("notfound--------------", this.file, pathFuncNodes);
          console.log(node, this.src.substr(node.start, node.end-node.start));
          //function_list.map((p)=>{console.log(p)});
          //path.map((p)=>{console.log(p, this.src.substr(p.start, p.end-p.start))});
          return;
        }
        if (node.type === 'SwitchStatement') {
          func.complex += node.cases.length;
        } else {
          func.complex += 1;
        }
      });
      const result = [];
      function_list.map((f)=>{
        result.push({
          file: this.file,
          name: f.name,
          complex: f.complex,
          loc: f.loc,
          code: f.code,
          line: this.src.substr(0, f.node.start).split('\n').length + offsetLine
        });
      });
      return result;
    }
  }
  module.exports = Parser
