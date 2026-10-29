# Runs each tool on each video behind a fresh logging proxy, under /usr/bin/time. One JSON per run in
# bench/.work/results/<run>/, with the proxy's log of every OpenAI request next to it.
# Usage: python3 bench/run.py [--runs N] [--videos DIR] [--tools ours,cvv,crv,byjlw]
import argparse, glob, json, os, platform, re, socket, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE); W = os.path.join(HERE, ".work")
ap = argparse.ArgumentParser()
ap.add_argument("--runs", type=int, default=1)
ap.add_argument("--videos", default=os.path.join(W, "videos"))
ap.add_argument("--tools", default="ours,cvv,crv,byjlw")
args = ap.parse_args()
if not os.environ.get("OPENAI_API_KEY"): sys.exit("run: OPENAI_API_KEY is not set")
TIME = ["/usr/bin/time", "-l"] if platform.system() == "Darwin" else ["/usr/bin/time", "-v"]

def command(tool, vid, out, base):
    bin_ = lambda env: os.path.join(W, "env", env, "bin")
    py = f"{sys.executable} -I"
    if tool == "ours":
        # --transcribe: the other tools transcribe every video, and a file has no words without it
        return f'node {REPO}/dist/cli.js analyze "{vid}" --out "{out}" --transcribe > "{out}/summary.txt"'
    if tool == "byjlw":
        return (f'cd "{out}" && {bin_("byjlw")}/video-analyzer "{vid}" --client openai_api --api-key "$OPENAI_API_KEY" '
                f'--api-url {base} --model gpt-6-luna --output "{out}" --log-level WARNING')
    if tool == "crv":
        return (f'{bin_("crv")}/crv "{vid}" -o "{out}/crv" --overwrite && {py} {HERE}/crv_frames.py "{out}/crv" "{out}/frames.json" && '
                f'{py} {HERE}/llm_step.py "{out}/frames.json" "{out}/crv/transcript.txt" "{out}/breakdown.json"')
    if tool == "cvv":
        server = os.path.join(W, "src/claude-video-vision/mcp-server/dist/index.js")
        return (f'node {HERE}/cvv_watch.mjs {server} "{vid}" "{out}" && '
                f'{py} {HERE}/llm_step.py "{out}/frames.json" "{out}/transcript.txt" "{out}/breakdown.json"')
    sys.exit(f"run: unknown tool {tool}")

def usage(err):
    num = lambda pats: next((float(m.group(1)) for p in pats if (m := re.search(p, err))), None)
    rss = num([r"(\d+)\s+maximum resident set size", r"Maximum resident set size \(kbytes\): (\d+)"])
    if rss is not None: rss = rss / 2**20 if platform.system() == "Darwin" else rss / 1024
    return {"user_s": num([r"([\d.]+) user", r"User time \(seconds\): ([\d.]+)"]),
            "sys_s": num([r"([\d.]+) sys", r"System time \(seconds\): ([\d.]+)"]),
            "max_rss_mb": round(rss, 1) if rss is not None else None}

def run_one(tool, vid, tag):
    name = os.path.splitext(os.path.basename(vid))[0]
    out = os.path.join(W, "out", tag, f"{tool}-{name}"); res = os.path.join(W, "results", tag)
    os.makedirs(out, exist_ok=True); os.makedirs(res, exist_ok=True)
    log = os.path.join(res, f"{tool}-{name}.calls.jsonl"); open(log, "w").close()
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    proxy = subprocess.Popen([sys.executable, "-I", os.path.join(HERE, "proxy.py"), str(port), log])
    time.sleep(0.5)
    base = f"http://127.0.0.1:{port}/v1"
    env = dict(os.environ, OPENAI_BASE_URL=base)
    if tool == "cvv": env["HOME"] = os.path.join(W, "home-cvv")
    t0 = time.time()
    p = subprocess.run(TIME + ["sh", "-c", command(tool, vid, out, base)], env=env, capture_output=True, text=True)
    wall = time.time() - t0
    proxy.terminate(); proxy.wait()
    calls = [json.loads(l) for l in open(log)]
    r = {"tool": tool, "video": name, "run": tag, "exit": p.returncode, "wall_s": round(wall, 2), **usage(p.stderr),
         "calls": len(calls), "api_s": round(sum(c.get("latency", 0) for c in calls), 2),
         "images": sum(c.get("images", 0) for c in calls), "bytes_up": sum(c["bytes_up"] for c in calls),
         "errors": [c["error"] for c in calls if c.get("error")], "stderr_tail": "" if p.returncode == 0 else p.stderr[-1500:]}
    json.dump(r, open(os.path.join(res, f"{tool}-{name}.json"), "w"), indent=1)
    print(json.dumps({k: r[k] for k in ("tool", "video", "run", "exit", "wall_s", "max_rss_mb", "calls", "images")}), flush=True)

videos = sorted(glob.glob(os.path.join(args.videos, "*.mp4")))
if not videos: sys.exit(f"run: no .mp4 in {args.videos}; run bench/make-videos.sh or pass --videos")
for i in range(1, args.runs + 1):
    for vid in videos:
        for tool in args.tools.split(","):
            run_one(tool, os.path.abspath(vid), f"r{i}")
