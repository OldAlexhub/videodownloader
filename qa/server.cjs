// Local-only reproducible browser/download corpus. No third-party content or ad requests.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const mediaRoot = path.join(__dirname, 'media');
const pages = {
  '/': `<h1>Video Downloader QA</h1><p>Original six-second synthetic videos; no external services.</p>${['single','ads','multiple','embedded','popup','spa','hls','dash','error','fake','expired','redirect'].map(name => `<p><a href="/${name}">${name}</a></p>`).join('')}`,
  '/single': '<h1>One video, multiple observations</h1><video id="player" controls src="/media/content.mp4"><source src="/media/content.mp4"><source src="/media/high.mp4"></video><script>for(let i=0;i<15;i++)fetch("/media/content.mp4");</script>',
  '/ads': '<h1>Preroll → content → midroll</h1><div id="container" class="vjs-ad-playing"><video id="player" controls src="/media/promo.mp4"></video></div><button onclick="container.className=\'\';player.src=\'/media/content.mp4\';player.play()">Start content</button><button onclick="container.className=\'vjs-ad-playing\';player.src=\'/media/promo.mp4\';player.play()">Midroll</button>',
  '/multiple': '<h1>Two different videos</h1><video controls src="/media/content.mp4"></video><video controls src="/media/other.mp4"></video>',
  '/embedded': '<h1>Embedded player</h1><iframe width="100%" height="360" src="http://localhost:8097/embed"></iframe>',
  '/embed': '<video controls src="/media/content.mp4"></video>',
  '/popup': '<h1>Popup parent</h1><a href="/single" target="_blank">Open child tab</a><button onclick="window.open(\'/multiple\')">User-initiated window</button><script>setTimeout(()=>window.open("/ads"),2000)</script><a href="/multiple">Navigate normally</a>',
  '/spa': '<h1 id="heading">SPA one</h1><video controls src="/media/content.mp4"></video><button onclick="history.pushState({},\'\',\'/spa?two\');heading.textContent=\'SPA two\'">Next SPA page</button>',
  '/hls': '<h1>HLS on-demand</h1><video controls src="/media/content.m3u8"></video>',
  '/dash': '<h1>DASH on-demand</h1><a href="/media/content.mpd">Inspect manifest</a><script>fetch("/media/content.mpd")</script>',
  '/error': '<h1>Service unavailable</h1><p>This 503 response must remain visible.</p><a href="/">Return to fixtures</a>',
  '/fake': '<h1>HTML masquerading as video</h1><video controls src="/fake.mp4"></video>',
  '/expired': '<h1>Expired resource</h1><video controls src="/expired.mp4"></video>',
};
http.createServer((request,response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/redirect') {response.writeHead(302,{Location:'/single'});return response.end();}
  if (pathname === '/expired.mp4') {response.writeHead(403);return response.end('Expired');}
  if (pathname === '/fake.mp4') {response.writeHead(200,{'Content-Type':'text/html'});return response.end('<!doctype html><h1>Sign in required</h1>');}
  if (Object.hasOwn(pages,pathname)) {
    response.writeHead(pathname === '/error' ? 503 : 200, {'Content-Type':'text/html; charset=utf-8'});
    return response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA ${pathname}</title><style>body{font:18px system-ui;padding:20px;background:#f1f5f9;color:#10213b}video{width:100%;max-height:320px;background:#111}button,a{display:inline-block;padding:16px;margin:8px}</style>${pages[pathname]}`);
  }
  const name = pathname.startsWith('/media/') ? pathname.slice(7) : '';
  if (!name || name !== path.basename(name)) {response.writeHead(404);return response.end();}
  const file = path.join(mediaRoot, name);
  if (!fs.existsSync(file)) {response.writeHead(404);return response.end();}
  const size = fs.statSync(file).size;
  const type = name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.mpd') ? 'application/dash+xml' : name.endsWith('.ts') ? 'video/mp2t' : 'video/mp4';
  let start = 0, end = size - 1;
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
  if (range) {start=Number(range[1]);end=range[2] ? Math.min(Number(range[2]),end) : end;}
  if (start > end) {response.writeHead(416,{'Content-Range':`bytes */${size}`});return response.end();}
  response.writeHead(range ? 206 : 200, {'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes', ...(range ? {'Content-Range':`bytes ${start}-${end}/${size}`} : {})});
  if (request.method === 'HEAD') return response.end();
  fs.createReadStream(file,{start,end}).pipe(response);
}).listen(8097, '127.0.0.1', () => console.log('QA fixtures: http://127.0.0.1:8097'));
