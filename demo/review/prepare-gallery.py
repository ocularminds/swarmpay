"""Package actual final hosted-test captures without redrawing product state."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, shutil
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
out = root / 'docs/review/submission/gallery'
out.mkdir(parents=True, exist_ok=True)
source = root / 'apps/web/test-results/hosted'
journey = next(source.glob('commerce-one-next-action-*-hosted'))
landing = next(source.glob('commerce-landing-and-sign-*-hosted'))
entries = [
    ('landing-desktop', landing/'desktop-landing.png', 'Landing and event composer'),
    ('landing-mobile', landing/'mobile-landing.png', 'Mobile landing'),
    ('approval', journey/'desktop-approval.png', 'Exact plan consent'),
    ('checkout', journey/'desktop-checkout.png', 'Merchant checkout handoff'),
    ('awaiting-delivery', journey/'desktop-awaiting-delivery.png', 'Authorization awaits delivery'),
    ('held-request', journey/'desktop-held-request.png', 'Held request and its decision'),
    ('held-mobile', journey/'mobile-held-request.png', 'Mobile held-request evidence'),
    ('completed', journey/'desktop-completed.png', 'Completed plan and payment schedule'),
    ('payments', journey/'desktop-payments.png', 'Settlement-aware payment overview'),
    ('payments-mobile', journey/'mobile-payments.png', 'Mobile dashboard widgets'),
    ('ledger', journey/'desktop-ledger.png', 'Filtered payment ledger'),
    ('agent-access', journey/'desktop-agent-access.png', 'Bounded agent access'),
]
proof = json.loads((root/'docs/review/evidence/technical/verification.json').read_text())
manifest = {'preparedAt':datetime.now(timezone.utc).isoformat(), 'environment':'Local HTTPS fixture; simulated model, payments, catalogs and venue; local test authority.',
    'applicationTree':'f04d97349842d6d3d2b48eb6783f5d664a1e9d34 (identical application tree to tested eba7fba8b851c31ccf5169fd29e9c83b10896cba)',
    'verificationSourceFingerprintSha256':proof['sourceFingerprintSha256'], 'notPublicDeployment':True,
    'cover':'../../../apps/web/public/brand/swarmpay-cover-devpost.png', 'images':[]}
font_dir = root/'apps/web/public/brand/fonts'
font = ImageFont.truetype(str(font_dir/'DMSans-Medium.ttf'), 18)
heading = ImageFont.truetype(str(font_dir/'Manrope-Bold.ttf'), 30)
sheet = Image.new('RGB',(1560,1470),'#F7FAF7'); d=ImageDraw.Draw(sheet)
d.text((36,24),'SwarmPay · current review gallery',fill='#142F2B',font=heading)
d.text((36,70),'November 10, 2026 · actual HTTPS fixture captures · simulated payments and venue',fill='#52665F',font=font)
for i,(slug,original,title) in enumerate(entries):
    assert original.is_file(), original
    target=out/(slug+'.png');shutil.copyfile(original,target)
    im=Image.open(target).convert('RGB');raw=target.read_bytes()
    manifest['images'].append({'file':'gallery/'+target.name,'title':title,'width':im.width,'height':im.height,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
        'capturedAt':datetime.fromtimestamp(original.stat().st_mtime,timezone.utc).isoformat(),'source':str(original.relative_to(root)),
        'notes':'Original pixels; full-page screenshot. The approval test uses separate simulated checkout dialogs, not real PayPal popups.' if slug=='checkout' else 'Original pixels; no product states composited.'})
    x=30+(i%4)*385;y=120+(i//4)*445
    d.rounded_rectangle((x,y,x+365,y+420),radius=14,fill='white',outline='#D8E4DF',width=2)
    im.thumbnail((345,355));sheet.paste(im,(x+(365-im.width)//2,y+12))
    d.text((x+14,y+378),title,fill='#142F2B',font=font)
sheet.save(out/'contact-sheet.jpg',quality=92)
(root/'docs/review/submission/gallery.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Packaged {len(entries)} original screenshots and a contact sheet.')
