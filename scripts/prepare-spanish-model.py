"""Download and quantize OPUS-MT's larger English-Spanish model for local use."""
import os
import sys
from pathlib import Path

work = Path(os.environ["TEMP"]) / "japan-cards-strong-translation"
sys.path.insert(0, str(work))
os.environ["HF_HOME"] = str(work / "hf-cache")
from huggingface_hub import snapshot_download
from ctranslate2.converters import TransformersConverter

source = snapshot_download("Helsinki-NLP/opus-mt-tc-big-en-es", local_dir=work / "source-model",
    allow_patterns=["*.json", "*.spm", "*.safetensors", "pytorch_model.bin"])
target = work / "ct2-model"
if not (target / "model.bin").exists():
    TransformersConverter(source).convert(str(target), quantization="int8")
print(target, flush=True)
