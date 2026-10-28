"""Rasterize the checked-in, licensed SVG artwork into bundled PNG image data.
Run with Python + CairoSVG + Pillow when updating source icons; normal builds use the generated TS.
"""
import base64,io,json,pathlib
from PIL import Image
import cairosvg
root=pathlib.Path(__file__).resolve().parents[1]
manifest=json.loads((root/'public/assets/brands/manifest.json').read_text())
def png(path):
    rendered=cairosvg.svg2png(url=str(path),output_width=192,output_height=192)
    image=Image.open(io.BytesIO(rendered)).convert('RGBA').quantize(colors=256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
    output=io.BytesIO();image.save(output,format='PNG',optimize=True)
    return 'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()
brands={row['id']:png(root/'public'/row['file'].lstrip('/')) for row in manifest}
pages={path.stem:png(path) for path in sorted((root/'public/assets/pages').glob('*.svg'))}
(root/'src/bundled-icon-images.ts').write_text('// Generated from the licensed SVG sources by scripts/bundle-icon-images.py.\nexport const brandIconImages:Record<string,string>='+json.dumps(brands,separators=(',',':'))+';\nexport const pageIconImages:Record<string,string>='+json.dumps(pages,separators=(',',':'))+';\n')
print(f'Bundled {len(brands)} brand and {len(pages)} page PNG icons.')
