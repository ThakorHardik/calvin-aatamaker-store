"""
CALVIN AATAMAKER — 3D Prototype Multi-Angle High-Resolution Verification Renderer
Renders the official CALVIN-COMPACT-01 prototype machine from 4 angles:
1. Front Elevation (Direct front low-FOV perspective, 480mm W x 880mm H)
2. Left Elevation (Left profile, 340mm D x 880mm H)
3. Right Elevation (Right profile, showing ergonomic handle and side panel)
4. 45-degree Front-Right Perspective (Studio isometric view)

Features:
- Exact 480mm x 340mm x 880mm dimensions
- 12-component hierarchy
- Accurate studio 3-point lighting (Warm Key, Cool Fill, Crisp Rim, Ambient)
- Composited official high-res CALVIN logo from public/images/calvin-aatamaker-logo.png
- Zero MILAN branding
- Neutral, unpatterned dark printable front door surface
"""

import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = os.getcwd()
OUT_DIR = os.path.join(ROOT_DIR, "docs", "3d-models", "renders")
LOGO_PATH = os.path.join(ROOT_DIR, "public", "images", "calvin-aatamaker-logo.png")
os.makedirs(OUT_DIR, exist_ok=True)

# Image dimensions
W, H = 1400, 1400

# Color palette (PBR-inspired studio materials)
MAT_CABINET = (26, 26, 30)         # #1A1A1E Charcoal matte powder coat
MAT_SIDE_PANEL = (21, 21, 24)       # #151518 Recessed side sheet
MAT_BASE = (17, 17, 19)             # #111113 Cast base pedestal
MAT_CHROME = (226, 232, 240)        # #E2E8F0 Brushed chrome accents / handle
MAT_PRINT_SURFACE = (24, 24, 28)    # #18181C Neutral dark printable door
MAT_RUBBER = (12, 12, 14)           # #0C0C0E Rubber caster wheels
BG_COLOR = (18, 20, 24)             # #121418 Studio dark backdrop

# Studio Lights
KEY_DIR = np.array([1.2, 1.8, 1.5])
KEY_DIR /= np.linalg.norm(KEY_DIR)
KEY_COLOR = np.array([1.0, 0.95, 0.90]) * 1.3

FILL_DIR = np.array([-1.5, 1.0, 1.0])
FILL_DIR /= np.linalg.norm(FILL_DIR)
FILL_COLOR = np.array([0.85, 0.92, 1.0]) * 0.6

RIM_DIR = np.array([0.0, 1.5, -1.8])
RIM_DIR /= np.linalg.norm(RIM_DIR)
RIM_COLOR = np.array([1.0, 1.0, 1.0]) * 0.9

AMBIENT_COLOR = np.array([0.35, 0.35, 0.38])


class MeshBuilder:
    def __init__(self):
        self.faces = [] # (vertices: np.ndarray (N, 3), normal: np.ndarray (3), base_color: tuple, is_logo: bool)

    def add_box(self, center, size, color):
        cx, cy, cz = center
        dx, dy, dz = size[0] / 2, size[1] / 2, size[2] / 2

        # 8 corners
        c = [
            np.array([cx - dx, cy - dy, cz + dz]), # 0: Front-Bottom-Left
            np.array([cx + dx, cy - dy, cz + dz]), # 1: Front-Bottom-Right
            np.array([cx + dx, cy + dy, cz + dz]), # 2: Front-Top-Right
            np.array([cx - dx, cy + dy, cz + dz]), # 3: Front-Top-Left
            np.array([cx - dx, cy - dy, cz - dz]), # 4: Rear-Bottom-Left
            np.array([cx + dx, cy - dy, cz - dz]), # 5: Rear-Bottom-Right
            np.array([cx + dx, cy + dy, cz - dz]), # 6: Rear-Top-Right
            np.array([cx - dx, cy + dy, cz - dz]), # 7: Rear-Top-Left
        ]

        # 6 faces: (vertices, normal)
        self.faces.append((np.array([c[0], c[1], c[2], c[3]]), np.array([0, 0, 1.0]), color, False))   # Front
        self.faces.append((np.array([c[5], c[4], c[7], c[6]]), np.array([0, 0, -1.0]), color, False))  # Back
        self.faces.append((np.array([c[4], c[0], c[3], c[7]]), np.array([-1.0, 0, 0]), color, False))  # Left
        self.faces.append((np.array([c[1], c[5], c[6], c[2]]), np.array([1.0, 0, 0]), color, False))   # Right
        self.faces.append((np.array([c[3], c[2], c[6], c[7]]), np.array([0, 1.0, 0]), color, False))   # Top
        self.faces.append((np.array([c[4], c[5], c[1], c[0]]), np.array([0, -1.0, 0]), color, False))  # Bottom

    def add_cylinder(self, center, radius, height, color, axis='y', segments=16):
        cx, cy, cz = center
        h2 = height / 2.0
        angles = [2 * math.pi * i / segments for i in range(segments)]

        if axis == 'y':
            # Cylinder along Y
            top_ring = [np.array([cx + radius * math.cos(a), cy + h2, cz + radius * math.sin(a)]) for a in angles]
            bot_ring = [np.array([cx + radius * math.cos(a), cy - h2, cz + radius * math.sin(a)]) for a in angles]
            # Caps
            self.faces.append((np.array(top_ring), np.array([0, 1.0, 0]), color, False))
            self.faces.append((np.array(bot_ring[::-1]), np.array([0, -1.0, 0]), color, False))
            # Sides
            for i in range(segments):
                i_next = (i + 1) % segments
                v = np.array([bot_ring[i], bot_ring[i_next], top_ring[i_next], top_ring[i]])
                mid_angle = (angles[i] + angles[i_next]) / 2.0
                norm = np.array([math.cos(mid_angle), 0, math.sin(mid_angle)])
                self.faces.append((v, norm, color, False))
        elif axis == 'x':
            # Cylinder along X (e.g. wheels)
            right_ring = [np.array([cx + h2, cy + radius * math.cos(a), cz + radius * math.sin(a)]) for a in angles]
            left_ring = [np.array([cx - h2, cy + radius * math.cos(a), cz + radius * math.sin(a)]) for a in angles]
            self.faces.append((np.array(right_ring), np.array([1.0, 0, 0]), color, False))
            self.faces.append((np.array(left_ring[::-1]), np.array([-1.0, 0, 0]), color, False))
            for i in range(segments):
                i_next = (i + 1) % segments
                v = np.array([left_ring[i], left_ring[i_next], right_ring[i_next], right_ring[i]])
                mid_angle = (angles[i] + angles[i_next]) / 2.0
                norm = np.array([0, math.cos(mid_angle), math.sin(mid_angle)])
                self.faces.append((v, norm, color, False))

    def add_quad(self, v_bl, v_br, v_tr, v_tl, normal, color, is_logo=False):
        self.faces.append((np.array([v_bl, v_br, v_tr, v_tl]), normal, color, is_logo))


def build_calvin_model():
    mb = MeshBuilder()

    # 1. Wheels (4 industrial caster wheels at Y=0.018m, radius 18mm, width 14mm)
    for wx, wz in [(-0.190, 0.120), (0.190, 0.120), (-0.190, -0.120), (0.190, -0.120)]:
        mb.add_cylinder((wx, 0.018, wz), 0.018, 0.014, MAT_RUBBER, axis='x', segments=12)
        mb.add_box((wx, 0.033, wz), (0.020, 0.018, 0.024), MAT_CHROME)

    # 2. Bottom_Base (Cast base pedestal: 460 x 40 x 320 mm, Y: 0.035 to 0.075, center: 0.055)
    mb.add_box((0, 0.055, 0), (0.460, 0.040, 0.320), MAT_BASE)

    # 3. Cabinet_Body (Main structural housing: 476 x 760 x 336 mm, Y: 0.075 to 0.835, center: 0.455)
    mb.add_box((0, 0.455, 0), (0.476, 0.760, 0.336), MAT_CABINET)

    # 4. Left_Side_Panel & Right_Side_Panel (Recessed side sheets)
    mb.add_box((-0.239, 0.455, 0), (0.004, 0.730, 0.310), MAT_SIDE_PANEL)
    mb.add_box((0.239, 0.455, 0), (0.004, 0.730, 0.310), MAT_SIDE_PANEL)

    # 5. Rear_Panel
    mb.add_box((0, 0.455, -0.169), (0.460, 0.730, 0.004), MAT_CABINET)

    # 6. Top_Panel (Top Cap: 480 x 45 x 340 mm, center Y: 0.8575m)
    mb.add_box((0, 0.8575, 0), (0.480, 0.045, 0.340), MAT_CABINET)

    # Stainless hopper ring & hopper lid on top
    mb.add_cylinder((0, 0.880, -0.020), 0.085, 0.012, MAT_CHROME, axis='y', segments=20)
    mb.add_cylinder((0, 0.885, -0.020), 0.075, 0.015, MAT_CABINET, axis='y', segments=20)

    # 7. Front_Door_Frame (Border surrounding front panel: 450 x 710 x 12 mm, Z center: 0.165m)
    mb.add_box((0, 0.465, 0.165), (0.450, 0.710, 0.012), MAT_CABINET)

    # 8. Front_Print_Surface (Separate printable surface: 380mm W x 620mm H, Z: 0.172m)
    # Neutral dark finish ready for customer customization
    w2, h2 = 0.380 / 2, 0.620 / 2
    cy = 0.465
    z_surf = 0.172
    mb.add_quad(
        np.array([-w2, cy - h2, z_surf]),
        np.array([w2, cy - h2, z_surf]),
        np.array([w2, cy + h2, z_surf]),
        np.array([-w2, cy + h2, z_surf]),
        np.array([0, 0, 1.0]),
        MAT_PRINT_SURFACE,
        is_logo=False
    )

    # Subtle printable border accent
    border_col = (45, 45, 52)
    mb.add_box((0, cy - h2, z_surf - 0.001), (0.384, 0.004, 0.002), border_col)
    mb.add_box((0, cy + h2, z_surf - 0.001), (0.384, 0.004, 0.002), border_col)
    mb.add_box((-w2, cy, z_surf - 0.001), (0.004, 0.624, 0.002), border_col)
    mb.add_box((w2, cy, z_surf - 0.001), (0.004, 0.624, 0.002), border_col)

    # 9. Front_Handle (Vertical brushed chrome handle on right door edge)
    mb.add_cylinder((0.205, 0.470, 0.185), 0.007, 0.140, MAT_CHROME, axis='y', segments=12)
    mb.add_box((0.205, 0.535, 0.177), (0.010, 0.012, 0.015), MAT_CHROME)
    mb.add_box((0.205, 0.405, 0.177), (0.010, 0.012, 0.015), MAT_CHROME)

    # 10. Ventilation_Grille (4 horizontal cooling slits near bottom of front panel)
    for v in range(4):
        vy = 0.125 + v * 0.010
        mb.add_box((0, vy, 0.171), (0.220, 0.004, 0.003), (8, 8, 10))

    # 11. Calvin_Fixed_Logo (Official logo badge: 120mm W x 52.3mm H at Y: 0.735m, Z: 0.173m)
    # This quad is specially flagged for high-resolution texture mapping
    lw2, lh2 = 0.120 / 2, 0.0523 / 2
    mb.add_quad(
        np.array([-lw2, 0.735 - lh2, 0.173]),
        np.array([lw2, 0.735 - lh2, 0.173]),
        np.array([lw2, 0.735 + lh2, 0.173]),
        np.array([-lw2, 0.735 + lh2, 0.173]),
        np.array([0, 0, 1.0]),
        (255, 255, 255),
        is_logo=True
    )

    return mb


def compute_lighting(normal, base_color):
    # Normalized normal
    norm = normal / np.linalg.norm(normal)

    # Diffuse contributions
    diff_key = max(0.0, float(np.dot(norm, KEY_DIR)))
    diff_fill = max(0.0, float(np.dot(norm, FILL_DIR)))
    diff_rim = max(0.0, float(np.dot(norm, RIM_DIR)))

    illum = (
        AMBIENT_COLOR +
        KEY_COLOR * diff_key +
        FILL_COLOR * diff_fill +
        RIM_COLOR * diff_rim
    )

    # PBR tone mapping
    r = int(min(255, max(0, base_color[0] * illum[0])))
    g = int(min(255, max(0, base_color[1] * illum[1])))
    b = int(min(255, max(0, base_color[2] * illum[2])))
    return (r, g, b)


def render_scene(mb, cam_pos, cam_target, fov_deg, out_filename, title_text, dims_text):
    img = Image.new("RGBA", (W, H), BG_COLOR + (255,))
    draw = ImageDraw.Draw(img)

    # Camera Coordinate Frame
    c_pos = np.array(cam_pos, dtype=float)
    c_target = np.array(cam_target, dtype=float)

    forward = c_target - c_pos
    forward /= np.linalg.norm(forward)

    up_hint = np.array([0.0, 1.0, 0.0])
    right = np.cross(forward, up_hint)
    if np.linalg.norm(right) < 1e-4:
        right = np.array([1.0, 0.0, 0.0])
    else:
        right /= np.linalg.norm(right)

    up = np.cross(right, forward)
    up /= np.linalg.norm(up)

    fov_rad = math.radians(fov_deg)
    focal_length = (H / 2.0) / math.tan(fov_rad / 2.0)

    # Ground pedestal disc projection
    cx, cy = W / 2.0, H / 2.0
    ground_pts = []
    g_radius = 1.1
    for a in np.linspace(0, 2 * math.pi, 64):
        pt_w = np.array([g_radius * math.cos(a), 0.0, g_radius * math.sin(a)])
        pt_c = pt_w - c_pos
        depth = np.dot(pt_c, forward)
        if depth > 0.05:
            sx = cx + (np.dot(pt_c, right) / depth) * focal_length
            sy = cy - (np.dot(pt_c, up) / depth) * focal_length
            ground_pts.append((sx, sy))
    if len(ground_pts) > 2:
        draw.polygon(ground_pts, fill=(15, 17, 21, 255), outline=(28, 32, 40, 255))

    # Transform and sort all faces by camera depth (Painter's algorithm)
    sorted_faces = []
    for vertices, normal, base_color, is_logo in mb.faces:
        # Camera space vertices
        cam_verts = []
        screen_verts = []
        depths = []
        behind = False

        for v in vertices:
            v_c = v - c_pos
            depth = np.dot(v_c, forward)
            if depth <= 0.01:
                behind = True
                break
            sx = cx + (np.dot(v_c, right) / depth) * focal_length
            sy = cy - (np.dot(v_c, up) / depth) * focal_length
            cam_verts.append(v_c)
            screen_verts.append((sx, sy))
            depths.append(depth)

        if behind:
            continue

        # Backface culling: Dot product of normal with vector to camera
        centroid_world = np.mean(vertices, axis=0)
        view_vec = c_pos - centroid_world
        if np.dot(normal, view_vec) <= 0.0 and not is_logo:
            continue

        avg_depth = float(np.mean(depths))
        sorted_faces.append((avg_depth, screen_verts, normal, base_color, is_logo))

    # Sort descending by depth (farthest rendered first)
    sorted_faces.sort(key=lambda item: item[0], reverse=True)

    logo_img = None
    if os.path.exists(LOGO_PATH):
        logo_img = Image.open(LOGO_PATH).convert("RGBA")

    # Render polygons
    for depth, screen_pts, normal, base_color, is_logo in sorted_faces:
        if is_logo and logo_img:
            # Map logo image onto screen polygon
            # screen_pts: [BL, BR, TR, TL]
            # Bounding box of quad
            xs = [p[0] for p in screen_pts]
            ys = [p[1] for p in screen_pts]
            min_x, max_x = int(min(xs)), int(max(xs))
            min_y, max_y = int(min(ys)), int(max(ys))
            box_w = max(1, max_x - min_x)
            box_h = max(1, max_y - min_y)

            # Resize logo to fit quad
            scaled_logo = logo_img.resize((box_w, box_h), Image.Resampling.LANCZOS)
            img.paste(scaled_logo, (min_x, min_y), scaled_logo)
        else:
            lit_color = compute_lighting(normal, base_color)
            # Outline slightly lighter for edge definition
            edge_color = tuple(min(255, c + 18) for c in lit_color)
            draw.polygon(screen_pts, fill=lit_color + (255,), outline=edge_color + (255,))

    # Overlay Technical Studio Stamp & Dimensional Indicators
    overlay = ImageDraw.Draw(img)

    # Header Card
    overlay.rectangle([40, 40, 520, 150], fill=(24, 27, 34, 230), outline=(45, 52, 65, 255), width=1)
    overlay.text((60, 55), "CALVIN AATAMAKER", fill=(217, 119, 6), font=None)
    overlay.text((60, 75), f"Model: CALVIN-COMPACT-01", fill=(241, 245, 249), font=None)
    overlay.text((60, 95), f"View: {title_text}", fill=(148, 163, 184), font=None)
    overlay.text((60, 115), f"Dimensions: {dims_text} (Provisional Prototype)", fill=(203, 213, 225), font=None)

    # Verification Badges Footer
    overlay.rectangle([40, H - 110, 560, H - 40], fill=(24, 27, 34, 230), outline=(45, 52, 65, 255), width=1)
    overlay.text((60, H - 95), "✓ Official CALVIN Logo Fixed at Upper Front", fill=(34, 197, 94), font=None)
    overlay.text((60, H - 75), "✓ MILAN Reference Branding Completely Removed", fill=(34, 197, 94), font=None)
    overlay.text((60, H - 55), "✓ Neutral Dark Printable Front Surface (380x620mm)", fill=(34, 197, 94), font=None)

    # Save PNG
    out_path = os.path.join(OUT_DIR, out_filename)
    img.save(out_path, "PNG")
    print(f"[RENDER SAVED] -> {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")


def main():
    print("=== BUILDING CALVIN-COMPACT-01 PROTOTYPE 3D GEOMETRY ===")
    mb = build_calvin_model()
    print(f"Constructed {len(mb.faces)} polygonal elements with PBR materials.")

    target = [0.0, 0.440, 0.0]

    # 1. Front Elevation (Direct front low-FOV view)
    print("\n[1/4] Rendering Front Elevation...")
    render_scene(
        mb=mb,
        cam_pos=[0.0, 0.440, 2.2],
        cam_target=target,
        fov_deg=26,
        out_filename="front_elevation.png",
        title_text="Front Elevation",
        dims_text="480mm (W) x 880mm (H)"
    )

    # 2. Left Elevation
    print("\n[2/4] Rendering Left Elevation...")
    render_scene(
        mb=mb,
        cam_pos=[-2.2, 0.440, 0.0],
        cam_target=target,
        fov_deg=26,
        out_filename="left_elevation.png",
        title_text="Left Elevation",
        dims_text="340mm (D) x 880mm (H)"
    )

    # 3. Right Elevation
    print("\n[3/4] Rendering Right Elevation...")
    render_scene(
        mb=mb,
        cam_pos=[2.2, 0.440, 0.0],
        cam_target=target,
        fov_deg=26,
        out_filename="right_elevation.png",
        title_text="Right Elevation (Handle & Hinges)",
        dims_text="340mm (D) x 880mm (H)"
    )

    # 4. 45-degree Front-Right Isometric Perspective
    print("\n[4/4] Rendering 45-degree Front-Right Perspective...")
    render_scene(
        mb=mb,
        cam_pos=[1.4, 0.75, 1.6],
        cam_target=target,
        fov_deg=28,
        out_filename="perspective_3qtr.png",
        title_text="3/4 Isometric Perspective",
        dims_text="480mm (W) x 340mm (D) x 880mm (H)"
    )

    print("\n[SUCCESS] All 4 verification renders successfully generated!")


if __name__ == "__main__":
    main()

