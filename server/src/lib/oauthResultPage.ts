export function renderOAuthResultPage(opts: { icon: string; heading: string; message: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Couplet</title>
<style>
  body { margin:0; background:#F5F0E6; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;
         display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .card { max-width:340px; margin:24px; padding:36px 24px; background:#EDE8DC; border-radius:20px; text-align:center; }
  .icon { font-size:44px; margin-bottom:14px; }
  h1 { font-size:19px; font-weight:800; color:#1A2332; margin:0 0 10px; }
  p { font-size:14px; color:#1A2332; opacity:0.65; margin:0; line-height:1.5; }
  .pill { display:inline-block; margin-top:20px; padding:10px 20px; background:#E8604C;
          color:#fff; font-weight:700; font-size:14px; border-radius:12px; }
</style></head><body><div class="card">
  <div class="icon">${opts.icon}</div><h1>${opts.heading}</h1><p>${opts.message}</p>
  <div class="pill">You can close this tab</div>
</div></body></html>`;
}
