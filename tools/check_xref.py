"""Strict check of a PDF's cross-reference chain: every in-use entry must point at
'<num> <gen> obj', and the update must not reuse object numbers other than the ones
it intends to replace.  Usage: python3 tools/check_xref.py original.pdf filled.pdf"""
import re, sys, zlib

def xref_sections(d):
    off = int(re.findall(rb"startxref\s+(\d+)", d[-1024:])[-1])
    out = []
    while off is not None:
        m = re.match(rb"(\d+) 0 obj\s*<<(.*?)>>\s*stream\r?\n", d[off:], re.S)
        assert m, f"no xref stream at {off}"
        dic = m.group(2)
        length = int(re.search(rb"/Length (\d+)", dic).group(1))
        raw = d[off + m.end(): off + m.end() + length]
        if b"/FlateDecode" in dic:
            raw = zlib.decompress(raw)
        W = [int(x) for x in re.search(rb"/W\s*\[([^\]]*)\]", dic).group(1).split()]
        size = int(re.search(rb"/Size (\d+)", dic).group(1))
        idx = re.search(rb"/Index\s*\[([^\]]*)\]", dic)
        idx = [int(x) for x in idx.group(1).split()] if idx else [0, size]
        cols = re.search(rb"/Columns (\d+)", dic)
        if cols:  # PNG predictor
            c = int(cols.group(1)); rows, prevrow = [], bytearray(c)
            for i in range(0, len(raw), c + 1):
                row = bytearray(raw[i + 1:i + 1 + c])
                if raw[i] == 2:
                    row = bytearray((row[j] + prevrow[j]) & 255 for j in range(c))
                rows.append(bytes(row)); prevrow = row
            raw = b"".join(rows)
        entries, p, rw = {}, 0, sum(W)
        for start, count in zip(idx[::2], idx[1::2]):
            for n in range(start, start + count):
                f = [int.from_bytes(raw[p + sum(W[:k]): p + sum(W[:k + 1])], "big") if W[k] else (1 if k == 0 else 0) for k in range(3)]
                entries[n] = f; p += rw
        out.append((off, size, entries))
        pm = re.search(rb"/Prev (\d+)", dic)
        off = int(pm.group(1)) if pm else None
    return out

orig, filled = (open(f, "rb").read() for f in sys.argv[1:3])
secs = xref_sections(filled)
latest = {}
for _, _, e in reversed(secs):
    latest.update(e)
bad = 0
for n, (t, a, b) in sorted(latest.items()):
    if t == 1 and not re.match(rb"\s*%d %d obj" % (n, b), filled[a:a + 30]):
        print("BAD offset for", n, filled[a:a + 30]); bad += 1
orig_size = xref_sections(orig)[0][1]
new = secs[0][2]
reused = [n for n in new if n < orig_size]
print("sections:", len(secs), "| entries checked:", len(latest), "| bad:", bad)
print("original /Size:", orig_size, "| update replaces:", reused, "| new objects:", [n for n in new if n >= orig_size])
