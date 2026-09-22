"""film/src.html (markup + CSS) + film/src.js + manifest → film/index.html"""
import json

man = json.load(open("film/a/manifest.json"))
man["extras"]["flyRig"] = json.load(open("assets/fly/rig.json"))
html, js = open("film/src.html").read(), open("film/src.js").read()
assert "/*MANIFEST*/null" in js and "<script>" not in html
js = js.replace("/*MANIFEST*/null", json.dumps(man, separators=(",", ":")))
js = "".join(c if ord(c) < 128 else "\\u%04x" % ord(c) for c in js)  # ASCII-only script: immune to page encoding
open("film/index.html", "w").write(html + "\n<script>\n" + js + "</script>\n")
print("film/index.html written;", len(man.get("seqs", {})), "sequences")
