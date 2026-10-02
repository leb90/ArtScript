# Tabulates js-framework-benchmark results (median ms / MB / KB) from webdriver-ts/results.
#   python3 scripts/dev/jfb-table.py <js-framework-benchmark>/webdriver-ts/results
import collections, glob, json, sys

t = collections.defaultdict(dict)
for f in glob.glob(sys.argv[1] + "/*.json"):
    x = json.load(open(f))
    fw = x["framework"].split("-v")[0].replace("-keyed", "")
    v = x["values"]
    key = "total" if "total" in v else ("DEFAULT" if "DEFAULT" in v else list(v)[0])
    t[x["benchmark"]][fw] = v[key]["median"] if isinstance(v[key], dict) else v[key]
fws = sorted({f for row in t.values() for f in row})
print("benchmark".ljust(26) + "".join(f.ljust(13) for f in fws))
for b in sorted(t):
    print(b.ljust(26) + "".join(f"{t[b].get(f, 0):.1f}".ljust(13) for f in fws))
