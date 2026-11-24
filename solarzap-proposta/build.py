from pathlib import Path
import re,base64,sys
root=Path(__file__).resolve().parent
html=(root/'index.html').read_text(encoding='utf-8')
css=(root/'style.css').read_text(encoding='utf-8')
js=(root/'app.js').read_text(encoding='utf-8')
def inline(match):
    path=root/match.group(0)
    return 'data:image/webp;base64,'+base64.b64encode(path.read_bytes()).decode('ascii')
css=re.sub(r'assets/[\w-]+\.webp',inline,css)
html=re.sub(r'assets/[\w-]+\.webp',inline,html)
html=html.replace('<link rel="stylesheet" href="style.css">',f'<style>{css}</style>').replace('<script src="app.js" defer></script>',f'<script>document.addEventListener("DOMContentLoaded",()=>{{{js}}});</script>')
out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'proposta.html'
out.write_text(html,encoding='utf-8')
print(out)
