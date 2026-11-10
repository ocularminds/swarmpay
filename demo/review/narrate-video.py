"""Synthesize a generic licensed narrator and time a 165-second review demo."""
from pathlib import Path
import argparse, json, re, textwrap, importlib.metadata
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

p=argparse.ArgumentParser();p.add_argument('--models',type=Path,required=True);p.add_argument('--output',type=Path,default=Path('.local/review-20261110/video'));args=p.parse_args()
root=Path(__file__).resolve().parents[2];out=args.output.resolve();(out/'audio').mkdir(parents=True,exist_ok=True)
scenes=json.loads((root/'demo/review/video-scenes.json').read_text());engine=Kokoro(str(args.models/'kokoro-v1.0.onnx'),str(args.models/'voices-v1.0.bin'))
sr=24000
for scene in scenes:
    samples=[];sentence_cues=[];position=0.0
    for sentence in re.split(r'(?<=[.!?])\s+',scene['narration']):
        spoken=sentence.replace('SwarmPay','Swarm Pay').replace('AG Studio','A G Studio').replace('MCP','M C P').replace('ESCALATE','escalate').replace('HELD','held')
        voice,rate=engine.create(spoken,voice='af_heart',speed=1.02,lang='en-us');assert rate==sr
        duration=len(voice)/sr;sentence_cues.append({'text':sentence,'start':position,'end':position+duration})
        samples.extend([voice.astype(np.float32),np.zeros(round(sr*.14),dtype=np.float32)]);position+=duration+.14
    scene['speechSeconds']=position;scene['localCues']=sentence_cues;scene['samples']=np.concatenate(samples)
    print(json.dumps({'scene':scene['id'],'speechSeconds':round(position,2)}),flush=True)
minimum=[s['speechSeconds']+.8 for s in scenes];assert sum(minimum)<165,'Narration must leave time to read the evidence'
weights=[max(1,s['target']-m) for s,m in zip(scenes,minimum)];extra=165-sum(minimum)
parts=[];cues=[];position=0
for scene,minimum_seconds,weight in zip(scenes,minimum,weights):
    duration=minimum_seconds+extra*weight/sum(weights)
    scene['start']=position;scene['duration']=duration;scene['end']=position+duration
    lead=.35;tail=duration-scene['speechSeconds']-lead
    parts.extend([np.zeros(round(sr*lead),dtype=np.float32),scene.pop('samples'),np.zeros(round(sr*tail),dtype=np.float32)])
    for cue in scene.pop('localCues'):
        chunks=textwrap.wrap(cue['text'],width=126,break_long_words=False,break_on_hyphens=False)
        cursor=position+lead+cue['start'];weight_total=sum(len(c) for c in chunks)
        for chunk in chunks:
            length=(cue['end']-cue['start'])*len(chunk)/weight_total
            cues.append({'start':cursor,'end':cursor+length,'text':chunk});cursor+=length
    position+=duration
voice=np.concatenate(parts);voice=np.pad(voice,(0,max(0,165*sr-len(voice))))[:165*sr];sf.write(out/'audio/voiceover.wav',voice,sr,subtype='PCM_16')
def stamp(seconds):
    ms=round(seconds*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
(out/'captions.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n'+ '\n'.join(textwrap.wrap(c['text'],width=72)) for i,c in enumerate(cues))+'\n')
(out/'transcript.txt').write_text('\n\n'.join(s['narration'] for s in scenes)+'\n')
metadata={'durationSeconds':165,'sampleRate':sr,'voice':'Kokoro v1.0 / af_heart','voiceKind':'Generic synthetic voice; no impersonation or human presenter supplied.','speed':1.02,'modelLicense':'Apache-2.0','modelSource':'https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1','package':importlib.metadata.version('kokoro-onnx'),'scenes':scenes,'cues':cues}
(out/'narration-timing.json').write_text(json.dumps(metadata,indent=2)+'\n');print('Narration and captions timed to 165 seconds.',flush=True)
