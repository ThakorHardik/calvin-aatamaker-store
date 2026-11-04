import struct
import json
import numpy as np

with open("public/models/calvin-compact-01-prototype.glb", "rb") as f:
    data = f.read()

magic, version, length = struct.unpack("<4sII", data[:12])
print(f"GLB Header: magic={magic}, version={version}, length={length}")

# Chunk 0: JSON
c0_len, c0_type = struct.unpack("<II", data[12:20])
json_str = data[20:20 + c0_len].decode("utf-8")
gltf = json.loads(json_str)

# Chunk 1: BIN
bin_start = 20 + c0_len
c1_len, c1_type = struct.unpack("<II", data[bin_start:bin_start + 8])
bin_data = data[bin_start + 8:bin_start + 8 + c1_len]

print(f"JSON chunk: {c0_len} bytes, BIN chunk: {c1_len} bytes")
print(f"Nodes count: {len(gltf.get('nodes', []))}")
print(f"Meshes count: {len(gltf.get('meshes', []))}")
print(f"Accessors count: {len(gltf.get('accessors', []))}")
print("Top-level node names:", [n.get("name") for n in gltf.get("nodes", [])])

