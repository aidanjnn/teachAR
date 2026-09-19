"""Bounded, offline object-localization experiment; never grades a tutorial step."""
import argparse
import json
import os
import time
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'

import torch
from PIL import Image, ImageDraw
from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection

ROOT = Path(__file__).resolve().parent
REVISION = 'a2bb814dd30d776dcf7e30523b00659f4f141c71'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('image', type=Path)
    parser.add_argument('--prompt', default='an orange fox plush toy. a black and white goose plush toy. a cube shaped plush toy.')
    parser.add_argument('--out', type=Path, default=ROOT / 'runs' / 'plushies')
    parser.add_argument('--runs', type=int, choices=range(1, 4), default=2)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    source = Image.open(args.image).convert('RGB')
    model_path = ROOT / 'models' / 'grounding-dino-tiny'
    started = time.perf_counter()
    processor = AutoProcessor.from_pretrained(model_path, local_files_only=True, use_fast=False, trust_remote_code=False)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(model_path, local_files_only=True, use_safetensors=True, trust_remote_code=False).eval()
    load_s = time.perf_counter() - started
    inputs = processor(images=source, text=args.prompt, return_tensors='pt')
    durations = []
    with torch.inference_mode():
        for _ in range(args.runs):
            started = time.perf_counter()
            outputs = model(**inputs)
            durations.append(time.perf_counter() - started)
    results = processor.post_process_grounded_object_detection(
        outputs, input_ids=inputs.input_ids, threshold=.25, text_threshold=.25,
        target_sizes=[(source.height, source.width)],
    )[0]
    detections = [dict(label=label, score=float(score), box_xyxy=[round(float(x), 2) for x in box])
                  for label, score, box in zip(results['text_labels'], results['scores'], results['boxes'])]
    report = dict(model='IDEA-Research/grounding-dino-tiny', revision=REVISION,
                  device='cpu', torch_threads=4, transformers='4.57.6', image_size=list(source.size),
                  prompt=args.prompt, threshold=.25, text_threshold=.25, load_seconds=load_s,
                  inference_seconds=durations, detections=detections,
                  limitations='Single-image exploratory localization. Scores are not accuracy percentages. No destination, grip, fold, motion or 3D verification.')
    (args.out / 'results.json').write_text(json.dumps(report, indent=2))
    overlay = source.copy()
    draw = ImageDraw.Draw(overlay)
    for detection in detections:
        box = detection['box_xyxy']
        draw.rectangle(box, outline='#00ff99', width=3)
        draw.text((box[0], max(0, box[1]-14)), detection['label'], fill='#00ff99', stroke_width=1, stroke_fill='black')
    overlay.save(args.out / 'detections.jpg')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
