# Offline object-localization spike

This is isolated from the running TeachAR server. It does not consume OpenAI credits, upload camera frames, run in the background, or advance tutorial steps.

The public Grounding DINO Tiny safetensors checkpoint is pinned at `a2bb814dd30d776dcf7e30523b00659f4f141c71`. The historical local run used Transformers 4.57.6 with Torch/Pillow. This source-only archive does not include that environment or claim a fresh-checkout reproduction; it is not a dependency of the tutor. Model weights, environment and private outputs are ignored by Git. No `trust_remote_code` or pickle weights are used.

## Run on an image

```sh
.venv/bin/python inspect-local.py /absolute/path/to/photo.jpg \
  --prompt 'a shirt. a napkin.' --out runs/my-test --runs 2
```

The model must already be downloaded; inference enforces offline loading. It writes `results.json` and a private `detections.jpg`. `--runs` is limited to 1–3. Four CPU threads are used. Stop with Ctrl-C if needed.

Reproduce the download in an equivalent environment:

```sh
HF_HUB_DISABLE_IMPLICIT_TOKEN=1 .venv/bin/hf download IDEA-Research/grounding-dino-tiny \
  --revision a2bb814dd30d776dcf7e30523b00659f4f141c71 \
  --include '*.json' '*.txt' '*.safetensors' --local-dir models/grounding-dino-tiny
```

The first test on one saved Quest image found the three plushies at 4.09/2.59 seconds per forward pass. The negative prompt test produced false screwdriver/shirt detections at the default threshold. These runs establish feasibility and failure modes, not accuracy. Do not enable automatic correction based on this experiment. See [historical vision research](../../apps/webxr/META-VISION-RESEARCH.md) for the proposed held-out test set and projection limits.
