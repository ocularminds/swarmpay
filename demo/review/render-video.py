#!/usr/bin/env python3
"""Render the dated review demo from real captures and recorded MCP results.

Requires Pillow, ffmpeg and the private capture/narration package described in
docs/review/submission/README.md. Product pixels are only cropped/resized; the two
PayPal stills have explicitly recorded privacy masks. No product state is drawn.
"""
from __future__ import annotations

import argparse
from bisect import bisect_right
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFont, ImageOps

REPO = Path(__file__).resolve().parents[2]
FPS, WIDTH, HEIGHT = 30, 1920, 1080
COLORS = {"green": "#11695B", "citron": "#D5FF5F", "sky": "#A9E7FF",
          "ink": "#142F2B", "cloud": "#F7FAF7", "slate": "#52665F"}
FONTS = REPO / "apps/web/public/brand/fonts"
LEFT = (40, 138, 1330, 903)
RIGHT = (1360, 138, 1880, 903)


@lru_cache(maxsize=32)
def font(size, bold=False):
    name = "Manrope-Bold.ttf" if bold else "DMSans-Regular.ttf"
    return ImageFont.truetype(str(FONTS / name), size)


def lines(text, width, size, bold=False):
    measure = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    result, line = [], ""
    for word in text.split():
        candidate = (line + " " + word).strip()
        if line and measure.textlength(candidate, font=font(size, bold)) > width:
            result.append(line)
            line = word
        else:
            line = candidate
    if line:
        result.append(line)
    return result


def paragraph(draw, text, xy, width, size=27, fill=None, bold=False, gap=9):
    x, y = xy
    for line in lines(text, width, size, bold):
        draw.text((x, y), line, font=font(size, bold), fill=fill or COLORS["ink"])
        y += size + gap
    return y


def fit(image, box, canvas):
    x1, y1, x2, y2 = box
    image = ImageOps.contain(image, (x2 - x1, y2 - y1), Image.Resampling.LANCZOS)
    canvas.paste(image, (x1 + (x2 - x1 - image.width) // 2,
                         y1 + (y2 - y1 - image.height) // 2))


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Renderer:
    def __init__(self, root):
        self.root = root
        self.raw = root / "raw"
        self.private = root / "private"
        self.exports = root / "exports"
        self.exports.mkdir(parents=True, exist_ok=True)
        self.timing = json.loads((root / "narration-timing.json").read_text())
        self.scenes = self.timing["scenes"]
        self.frames = {}
        for name in ["01-plan-approval", "02-tents-sdk", "03-tents-callback",
                     "04-catering-sdk", "05-catering-callback", "07-receipt-and-capture",
                     "09-analyst-question"]:
            data = json.loads((self.raw / name / "frames.json").read_text())
            if not data["frames"]:
                raise ValueError(f"No real frames for {name}")
            self.frames[name] = data["frames"]
        evidence = REPO / "docs/review/evidence/submission"
        self.hold = json.loads((evidence / "mcp-hold.json").read_text())
        self.replay = json.loads((evidence / "mcp-replay.json").read_text())
        self.rehearsal = json.loads((evidence / "sandbox-rehearsal.json").read_text())
        assert self.hold["result"]["execution"] == "HELD"
        assert self.hold["before"]["capturedMinor"] == self.hold["after"]["capturedMinor"] == 50000
        assert self.replay["before"]["capturedMinor"] == self.replay["after"]["capturedMinor"] == 140000
        assert self.replay["captureIdsUnchanged"]
        self.inputs = {}
        for path in [evidence / "mcp-hold.json", evidence / "mcp-replay.json",
                     evidence / "sandbox-rehearsal.json", root / "narration-timing.json",
                     root / "audio/voiceover.wav"]:
            self.use(path)
        self.masks = {
            "tents-paypal.png": [[0, 0, 568, 102], [72, 212, 425, 268], [72, 296, 425, 347]],
            "catering-paypal.png": [[475, 5, 535, 63], [580, 325, 881, 373], [580, 405, 881, 456]],
        }

    def use(self, path):
        path = path.resolve()
        key = str(path.relative_to(REPO))
        if key not in self.inputs:
            self.inputs[key] = sha256(path)
        return path

    def source(self, clip, seconds):
        frames = self.frames[clip]
        first = frames[0]["timestamp"]
        times = [f["timestamp"] - first for f in frames]
        chosen = frames[max(0, bisect_right(times, max(0, seconds)) - 1)]
        return self.raw / clip / chosen["file"]

    def choice(self, scene, elapsed):
        kind = scene["id"]
        if kind in ("intro", "close"):
            return ("cover", REPO / "apps/web/public/brand/swarmpay-cover-wide.png")
        if kind == "plan":
            return ("product", self.source("01-plan-approval", max(0, elapsed - 10.5)))
        if kind in ("tents", "catering"):
            prefix = "02-tents-sdk" if kind == "tents" else "04-catering-sdk"
            callback = "03-tents-callback" if kind == "tents" else "05-catering-callback"
            if elapsed < 3:
                return ("product", self.source(prefix, elapsed))
            if elapsed < 6.5:
                return ("paypal", self.private / f"{kind}-paypal.png")
            return ("product", self.source(callback, elapsed - 6.5))
        if kind == "mcp":
            return ("mcp", None)
        if kind == "held":
            if elapsed >= 8:
                return ("decision-record", None)
            return ("product", self.private / "held.png")
        if kind == "receipt":
            # Let the narration explain the receipt before playing its actual 3.4s transition.
            return ("product", self.source("07-receipt-and-capture", max(0, elapsed - 6.2)))
        if kind == "replay":
            if elapsed >= 5:
                return ("capture-record", None)
            return ("product", self.private / "completed.png")
        if kind == "analyst":
            if elapsed < 4:
                return ("analyst-question", self.source("09-analyst-question", elapsed))
            return ("analyst-answer", self.private / "analyst-evidence.png")
        if kind == "review":
            name = "landing-desktop.png" if elapsed < 6 else "held-request.png"
            return ("review", REPO / "docs/review/submission/gallery" / name)
        raise ValueError(kind)

    def base(self, scene, choice):
        image = Image.new("RGB", (WIDTH, HEIGHT), COLORS["cloud"])
        draw = ImageDraw.Draw(image)
        draw.text((40, 30), scene["title"], font=font(42, True), fill=COLORS["ink"])
        label = "10 NOV 2026  /  RECORDED REVIEW"
        draw.text((42, 91), label, font=font(21), fill=COLORS["slate"])
        draw.text((1640, 39), "SwarmPay.", font=font(37, True), fill=COLORS["green"])
        draw.rounded_rectangle(LEFT, 18, fill="white", outline="#D7E3DC", width=2)
        draw.rounded_rectangle(RIGHT, 18, fill=COLORS["ink"])
        kind, path = choice
        if path:
            source = Image.open(self.use(path)).convert("RGB")
            if kind == "cover":
                draw.rectangle((40, 138, 1880, 903), fill=COLORS["cloud"])
                fit(source, (40, 138, 1880, 903), image)
            elif kind == "paypal":
                masking = ImageDraw.Draw(source)
                for rect in self.masks[path.name]:
                    masking.rectangle(rect, fill="#E8EEEB")
                if path.name == "catering-paypal.png":
                    source = source.crop((460, 0, 1030, 697))
                fit(source, (60, 165, 1310, 863), image)
                draw.text((82, 867), "Actual PayPal window · sandbox profile and funding details masked",
                          font=font(19), fill=COLORS["slate"])
            elif kind == "product":
                w, h = source.size
                source = source.crop((round(w * .225), round(h * .09), round(w * .79), h))
                fit(source, (54, 152, 1316, 889), image)
            elif kind == "analyst-question":
                w, h = source.size
                source = source.crop((round(w * .13), round(h * .09), round(w * .82), h))
                fit(source, (54, 152, 1316, 889), image)
            elif kind == "analyst-answer":
                # The actual answer, with the matching held request and ledger beside it.
                source = source.crop((190, 194, 1200, 697))
                fit(source, (54, 152, 1316, 889), image)
            elif kind == "review":
                # Top-of-page crop; the source remains a full, unmodified fixture screenshot.
                w, h = source.size
                source = source.crop((0, 0, w, min(h, round(w * .76))))
                fit(source, (54, 152, 1316, 889), image)
        elif kind == "mcp":
            self.mcp_panel(draw)
        else:
            self.record_panel(draw, kind)
        if kind != "cover":
            self.facts(draw, scene["id"])
        if scene["id"] == "review":
            disclosure = "PREPARED REVIEW BUILD · local fixture · simulated AI/payments/catalogs/venue · local test authority"
        else:
            disclosure = "PAYPAL SANDBOX · test money · simulated catalogs and venue · AgentSafe local test authority · edited for reading time"
        draw.text((40, 921), disclosure, font=font(20), fill=COLORS["slate"])
        return image

    def mcp_panel(self, draw):
        draw.text((82, 181), "RECORDED MCP REQUEST / RESPONSE", font=font(27, True), fill=COLORS["green"])
        y = paragraph(draw, "Node client → https://swarm.decionis.com/mcp", (82, 243), 1206, 31, bold=True)
        y = paragraph(draw, f'Protocol {self.hold["protocol"]} · {len(self.hold["tools"])} scoped tools',
                      (82, y + 18), 1206, 27)
        draw.rounded_rectangle((82, 383, 1288, 667), 16, fill=COLORS["cloud"])
        draw.text((111, 411), 'tools/call', font=font(30, True), fill=COLORS["green"])
        draw.text((111, 464), self.hold["request"]["name"], font=font(32, True), fill=COLORS["ink"])
        draw.text((111, 527), 'workflowId:', font=font(24), fill=COLORS["slate"])
        draw.text((111, 567), self.hold["workflowId"], font=font(26), fill=COLORS["ink"])
        paragraph(draw, "Human plan consent: HTTP 403", (82, 714), 1206, 34, bold=True)
        paragraph(draw, "Authenticated scope: the recording organizer only.", (82, 777), 1206, 27)
        draw.text((82, 854), "Source: mcp-hold.json · token omitted and subsequently revoked", font=font(20), fill=COLORS["slate"])

    def record_panel(self, draw, kind):
        draw.text((82, 181), "RECORDED EVIDENCE · JSON EXCERPT", font=font(27, True), fill=COLORS["green"])
        draw.text((82, 241), "workflowId", font=font(21), fill=COLORS["slate"])
        draw.text((82, 276), self.hold["workflowId"], font=font(28), fill=COLORS["ink"])
        if kind == "decision-record":
            draw.text((82, 350), "Gather Kitchen · catering · USD 900.00", font=font(33, True), fill=COLORS["ink"])
            fields = [("state / execution", f'{self.hold["result"]["state"]} / {self.hold["result"]["execution"]}'),
                      ("dossierId", self.hold["result"]["dossierId"]),
                      ("receiptVerified", str(self.hold["before"]["receiptVerified"]).lower()),
                      ("intentHash", self.hold["result"]["intentHash"])]
            y = 425
            for label, value in fields:
                draw.text((82, y), label, font=font(22), fill=COLORS["slate"])
                y = paragraph(draw, value, (82, y+33), 1190, 26, bold=label != "intentHash") + 20
            draw.text((82, 855), "Source: mcp-hold.json · real response; no catering capture command", font=font(20), fill=COLORS["slate"])
        else:
            y = 369
            for order in self.replay["after"]["orders"]:
                draw.text((82, y), f'{order["category"]} · ${order["amountMinor"]/100:,.0f} · {order["status"]}',
                          font=font(31, True), fill=COLORS["green"])
                draw.text((82, y+49), "captureId: " + order["captureId"], font=font(27), fill=COLORS["ink"])
                y += 123
            draw.line((82, 624, 1270, 624), fill="#D7E3DC", width=2)
            draw.text((82, 653), "Same 5 payment commands · captured total $1,400", font=font(30, True), fill=COLORS["ink"])
            draw.text((82, 723), "applicationChainVerified: " + str(self.rehearsal["applicationChainVerified"]).lower(),
                      font=font(30, True), fill=COLORS["green"])
            paragraph(draw, "Application record chain. Hosted/native signature verification is separate.",
                      (82, 779), 1190, 23)
            draw.text((82, 855), "Sources: mcp-replay.json + final browser evidence export", font=font(20), fill=COLORS["slate"])

    def facts(self, draw, kind):
        data = {
            "plan": [("EXACT TERMS", "$1,400", "30 guests · 5 rental tents"),
                     ("YOUR LIMIT", "$1,500", "$100 remains outside the plan"),
                     ("APPROVAL", "1 plan + 2 checkouts", "Each merchant needs PayPal approval.")],
            "tents": [("CANOPY COLLECTIVE", "$500", "5 tent rentals · captured"),
                      ("PAYPAL SANDBOX", "Native callback", "The actual SDK button opened this checkout."),
                      ("CAPTURE REFERENCE", "3WN51437L71088039", "One confirmed test payment.")],
            "catering": [("GATHER KITCHEN", "$900 authorized", "Payment waits for verified delivery."),
                         ("PAID SO FAR", "$500", "Tents only. Authorization is separate."),
                         ("AUTHORIZATION", "83N7533909747615T", "A separate merchant approval.")],
            "mcp": [("OUTSIDE CLIENT", "Real HTTP MCP", "No browser session or merchant credential is given to the agent."),
                    ("AUTHORIZATION", "403 denied", "An agent cannot give human plan consent."),
                    ("TEST ACCESS", "Revoked afterward", "The same token then returned HTTP 401.")],
            "held": [("RECORDED RESULT", "ESCALATE / HELD", "No verified delivery receipt attached."),
                     ("DOSSIER", self.hold["result"]["dossierId"], "Local test authority; synthetic decision identifiers."),
                     ("CAPTURED TOTAL", "$500 → $500", "No catering capture command was created.")],
            "receipt": [("DELIVERY FACTS", "Venue-signed", "Bound to event, caterer, quantity and delivery window."),
                        ("PAYPAL RESULT", "$900 captured", "After the verified receipt."),
                        ("TRUST BOUNDARY", "Simulated venue", "A signed statement is not proof of physical delivery.")],
            "replay": [("REPEATED REQUEST", "Same capture", "The successful result was returned again."),
                       ("CAPTURED TOTAL", "$1,400 → $1,400", "Exactly one capture per merchant."),
                       ("PROOF SCOPE", "MCP replay", "Exact receipt replay has separate fixture and historical proof.")],
            "analyst": [("EARLY REQUEST", "synthetic-dossier-5", "Held at 05:16:26 UTC: missing verified receipt."),
                        ("LATER CAPTURE", "synthetic-dossier-6", "Paid at 05:18:57 UTC: a separate successful payment."),
                        ("BOUNDARY", "Explain, not approve", "The answer is grounded in recorded decisions.")],
            "review": [("PREPARED UI", "Brand + UX", "New palette, typography, responsive layouts and accessible states."),
                       ("TECHNICAL REVIEW", "Settlement-aware", "179 Java tests and nine hosted browser cases passed."),
                       ("PUBLICATION", "Pending deployment", "These local fixture images show the review branch.")],
        }
        y = 174
        for label, value, detail in data[kind]:
            y = paragraph(draw, label, (1392, y), 452, 18, COLORS["sky"], True, 6)
            y = paragraph(draw, value, (1392, y + 13), 452, 32, "white", True, 8)
            y = paragraph(draw, detail, (1392, y + 12), 452, 24, "#DAE8E2", False, 8)
            y += 34
        if y > 902:
            raise ValueError(f"Facts overflow in {kind}: {y}")

    def caption(self, image, text):
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 962, WIDTH, HEIGHT), fill=COLORS["ink"])
        rows = lines(text, 1776, 30)
        if len(rows) > 2:
            raise ValueError(f"Caption exceeds two lines: {text}")
        y = 977 + (2 - len(rows)) * 19
        for row in rows:
            x = (WIDTH - draw.textlength(row, font=font(30))) // 2
            draw.text((x, y), row, font=font(30), fill="white")
            y += 39

    def render(self):
        output = self.exports / "SwarmPay-review-demo-1080p.mp4"
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
               "-pixel_format", "rgb24", "-video_size", "1920x1080", "-framerate", str(FPS),
               "-i", "pipe:0", "-i", str(self.root / "audio/voiceover.wav"),
               "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "fast",
               "-crf", "18", "-maxrate", "4200k", "-bufsize", "8400k", "-threads", "4",
               "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
               "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-t", "165", "-movflags", "+faststart", str(output)]
        process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        previous_base, previous_caption, base, payload = None, None, None, None
        cue_starts = [c["start"] for c in self.timing["cues"]]
        scene_starts = [s["start"] for s in self.scenes]
        preview_dir = self.exports / "frames"
        preview_dir.mkdir(exist_ok=True)
        previews = {}
        try:
            for frame in range(round(self.timing["durationSeconds"] * FPS)):
                at = frame / FPS
                scene = self.scenes[max(0, bisect_right(scene_starts, at) - 1)]
                elapsed = at - scene["start"]
                choice = self.choice(scene, elapsed)
                key = (scene["id"], choice)
                cue_index = bisect_right(cue_starts, at) - 1
                cue = self.timing["cues"][cue_index] if cue_index >= 0 else None
                text = cue["text"] if cue and at < cue["end"] else ""
                changed = key != previous_base
                if changed:
                    base = self.base(scene, choice)
                    previous_base = key
                if changed or text != previous_caption:
                    picture = base.copy()
                    self.caption(picture, text)
                    payload = picture.tobytes()
                    previous_caption = text
                if scene["id"] not in previews and elapsed > scene["duration"] * .65:
                    p = preview_dir / f'{len(previews)+1:02d}-{scene["id"]}.jpg'
                    picture.save(p, quality=93)
                    previews[scene["id"]] = p
                    print(f'Rendered preview: {scene["id"]} at {at:.1f}s', flush=True)
                process.stdin.write(payload)
        except BaseException:
            process.stdin.close()
            process.wait()
            raise
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("ffmpeg failed")
        for name in ("captions.srt", "transcript.txt", "narration-timing.json"):
            shutil.copy2(self.root / name, self.exports / name)
        sheet = Image.new("RGB", (1600, 4 * 342), COLORS["cloud"])
        d = ImageDraw.Draw(sheet)
        for i, scene in enumerate(self.scenes):
            im = Image.open(previews[scene["id"]])
            fit(im, ((i % 3)*533, (i // 3)*342 + 32, (i % 3)*533+525, (i // 3)*342+329), sheet)
            label = f'{scene["start"]:05.1f}s · {scene["title"]}'
            d.text(((i % 3)*533+8, (i // 3)*342+8), label, font=font(16, True), fill=COLORS["ink"])
        sheet.save(self.exports / "contact-sheet.jpg", quality=91)
        manifest = {
            "createdFrom": "November 10, 2026 recordings; existing public sandbox plus explicitly labeled prepared review gallery",
            "workflowId": self.hold["workflowId"], "publicSite": self.hold["site"],
            "deployedRevision": None, "deployedRevisionNote": "Not exposed publicly; existing Kubernetes identity denied deployment metadata read.",
            "reviewTree": "f04d97349842d6d3d2b48eb6783f5d664a1e9d34 (identical tree to verified eba7fba)",
            "durationSeconds": 165, "fps": FPS, "video": output.name,
            "videoSha256": sha256(output), "sizeBytes": output.stat().st_size,
            "voice": {k: self.timing[k] for k in ("voice", "voiceKind", "modelLicense", "modelSource")},
            "scenes": [{k:s[k] for k in ("id", "title", "start", "end", "duration")} for s in self.scenes],
            "editPolicy": "Real captured frames, timestamp-based playback, cuts over waiting, held frames for narration/reading. Static PayPal captures are labeled; no product pixels or amounts are fabricated. Text panels are explanatory excerpts of recorded results, not an app UI or terminal recording.",
            "privacyMasksInOriginalPixels": self.masks,
            "productCrops": "Workflow: x 22.5–79% / y 9–100%; analyst: answer plus matching decision/ledger; review gallery: top-of-page. PayPal catering still x 460–1030 / y 0–697 after masking.",
            "receiptReplayScope": "Fresh live MCP milestone replay; original signed receipt replay separately fixture-tested and historical. No new live exact-envelope replay is claimed.",
            "publication": "Prepared local artifact. Not uploaded or substituted for the existing public video.",
            "inputsSha256": self.inputs,
        }
        (self.exports / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n")
        print(json.dumps({"video": str(output), "bytes": manifest["sizeBytes"], "durationSeconds": 165}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, default=REPO / ".local/review-20261110/video")
    parser.add_argument("--preview-only", action="store_true")
    args = parser.parse_args()
    renderer = Renderer(args.work_dir.resolve())
    if args.preview_only:
        for scene in renderer.scenes:
            at = scene["duration"] * .65
            frame = renderer.base(scene, renderer.choice(scene, at))
            renderer.caption(frame, scene["narration"].split(". ")[0] + ".")
            frame.save(renderer.exports / f'preview-{scene["id"]}.jpg', quality=93)
        print("Previewed all scenes; no panel or caption overflow.")
    else:
        renderer.render()
