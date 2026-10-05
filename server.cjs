const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const root = __dirname;
const port = Number(process.env.PORT || 5173);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400);res.end('Bad request');return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403);res.end('Forbidden');return; }
  if (!['index.html','style.css','game.js'].includes(path.relative(root,file))) { res.writeHead(404);res.end('Not found');return; }
  fs.readFile(file,(err,data) => {
    if(err){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});res.end(data);
  });
}).listen(port,'0.0.0.0',() => console.log(`poco is ready at http://localhost:${port}`));
