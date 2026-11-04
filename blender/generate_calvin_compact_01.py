# ==============================================================================
# CALVIN AATAMAKER — 3D Prototype Model Generator for Blender 4.x / 3.x
# Model Code: CALVIN-COMPACT-01
# Provisional Prototype Dimensions: 480 mm (W) x 340 mm (D) x 880 mm (H)
# ==============================================================================
# Usage in Blender:
#   blender --background --python blender/generate_calvin_compact_01.py
# Or run inside Blender's Text Editor -> Run Script.
# ==============================================================================

import bpy
import math

def clear_scene():
    """Removes all default objects, meshes, and lights."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def setup_units():
    """Sets scene units to Metric (Millimeters during work)."""
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 0.001  # 1 unit = 1 mm
    scene.unit_settings.length_unit = 'MILLIMETERS'

def create_pbr_material(name, color_hex, roughness=0.4, metallic=0.0):
    """Creates a Principled BSDF material with PBR properties."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    
    # Hex to sRGB float conversion
    color_hex = color_hex.lstrip('#')
    r = int(color_hex[0:2], 16) / 255.0
    g = int(color_hex[2:4], 16) / 255.0
    b = int(color_hex[4:6], 16) / 255.0
    
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
    return mat

def build_compact_aatamaker():
    clear_scene()
    setup_units()
    
    # Materials
    mat_cabinet = create_pbr_material("mat_cabinet_body", "#1A1A1E", roughness=0.45, metallic=0.15)
    mat_side = create_pbr_material("mat_side_panel", "#151518", roughness=0.50, metallic=0.10)
    mat_base = create_pbr_material("mat_bottom_base", "#111113", roughness=0.60, metallic=0.20)
    mat_chrome = create_pbr_material("mat_chrome_accents", "#E2E8F0", roughness=0.15, metallic=0.85)
    mat_front_print = create_pbr_material("mat_front_print", "#18181C", roughness=0.35, metallic=0.05)
    mat_logo = create_pbr_material("mat_calvin_fixed_logo", "#FFFFFF", roughness=0.20, metallic=0.10)
    mat_rubber = create_pbr_material("mat_rubber_wheels", "#0A0A0C", roughness=0.80, metallic=0.05)
    
    # Root Empty
    root_empty = bpy.data.objects.new("CALVIN_Compact_Root", None)
    bpy.context.collection.objects.link(root_empty)
    root_empty.empty_display_type = 'ARROWS'
    root_empty.empty_display_size = 100
    
    # 1. Bottom_Base (460 x 320 x 40 mm)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    base = bpy.context.active_object
    base.name = "Bottom_Base"
    base.scale = (460, 320, 40)
    base.location = (0, 0, 55)
    base.parent = root_empty
    base.data.materials.append(mat_base)
    
    # 2. Wheels
    wheel_coords = [
        (-190, 120, 18),
        (190, 120, 18),
        (-190, -120, 18),
        (190, -120, 18)
    ]
    for i, (wx, wz, wy) in enumerate(wheel_coords):
        bpy.ops.mesh.primitive_cylinder_add(radius=18, depth=14)
        wheel = bpy.context.active_object
        wheel.name = f"Wheel_{i+1}"
        wheel.rotation_euler = (0, math.pi / 2, 0)
        wheel.location = (wx, wz, wy)
        wheel.parent = root_empty
        wheel.data.materials.append(mat_rubber)
    
    # 3. Cabinet_Body (476 x 336 x 760 mm)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    body = bpy.context.active_object
    body.name = "Cabinet_Body"
    body.scale = (476, 336, 760)
    body.location = (0, 0, 455)
    body.parent = root_empty
    body.data.materials.append(mat_cabinet)
    
    # Add Bevel Modifier to Cabinet Body
    bevel = body.modifiers.new(name="Bevel", type='BEVEL')
    bevel.width = 6.0
    bevel.segments = 3
    
    # 4. Left_Side_Panel & Right_Side_Panel
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    left_side = bpy.context.active_object
    left_side.name = "Left_Side_Panel"
    left_side.scale = (4, 310, 730)
    left_side.location = (-239, 0, 455)
    left_side.parent = root_empty
    left_side.data.materials.append(mat_side)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    right_side = bpy.context.active_object
    right_side.name = "Right_Side_Panel"
    right_side.scale = (4, 310, 730)
    right_side.location = (239, 0, 455)
    right_side.parent = root_empty
    right_side.data.materials.append(mat_side)
    
    # 5. Rear_Panel
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    rear = bpy.context.active_object
    rear.name = "Rear_Panel"
    rear.scale = (460, 4, 730)
    rear.location = (0, -169, 455)
    rear.parent = root_empty
    rear.data.materials.append(mat_cabinet)
    
    # 6. Top_Panel & Hopper (480 x 340 x 45 mm)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    top_panel = bpy.context.active_object
    top_panel.name = "Top_Panel"
    top_panel.scale = (480, 340, 45)
    top_panel.location = (0, 0, 857.5)
    top_panel.parent = root_empty
    top_panel.data.materials.append(mat_cabinet)
    
    # Chrome Funnel Ring
    bpy.ops.mesh.primitive_torus_add(major_radius=85, minor_radius=10)
    hopper_ring = bpy.context.active_object
    hopper_ring.name = "Top_Hopper_Ring"
    hopper_ring.location = (0, -20, 880)
    hopper_ring.parent = root_empty
    hopper_ring.data.materials.append(mat_chrome)
    
    # 7. Front_Door_Frame (450 x 12 x 710 mm)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    door_frame = bpy.context.active_object
    door_frame.name = "Front_Door_Frame"
    door_frame.scale = (450, 12, 710)
    door_frame.location = (0, 165, 465)
    door_frame.parent = root_empty
    door_frame.data.materials.append(mat_cabinet)
    
    # 8. Front_Print_Surface (380 x 620 mm) — The dynamic texture target
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    print_surface = bpy.context.active_object
    print_surface.name = "Front_Print_Surface"
    print_surface.rotation_euler = (math.pi / 2, 0, 0)
    print_surface.scale = (380, 620, 1.0)
    print_surface.location = (0, 172, 465)
    print_surface.parent = root_empty
    print_surface.data.materials.append(mat_front_print)
    
    # 9. Front_Handle
    bpy.ops.mesh.primitive_cylinder_add(radius=7, depth=140)
    handle = bpy.context.active_object
    handle.name = "Front_Handle"
    handle.location = (205, 185, 470)
    handle.parent = root_empty
    handle.data.materials.append(mat_chrome)
    
    # 10. Ventilation_Grille (4 horizontal slots)
    for v in range(4):
        bpy.ops.mesh.primitive_cube_add(size=1.0)
        vent = bpy.context.active_object
        vent.name = f"Vent_Slot_{v+1}"
        vent.scale = (220, 3, 5)
        vent.location = (0, 170, 125 + v * 10)
        vent.parent = root_empty
        vent.data.materials.append(mat_cabinet)
    
    # 11. Calvin_Fixed_Logo (120 x 52.3 mm at upper-front position)
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    logo = bpy.context.active_object
    logo.name = "Calvin_Fixed_Logo"
    logo.rotation_euler = (math.pi / 2, 0, 0)
    logo.scale = (120, 52.3, 1.0)
    logo.location = (0, 173, 735)
    logo.parent = root_empty
    logo.data.materials.append(mat_logo)
    
    print("[SUCCESS] CALVIN-COMPACT-01 prototype geometry built successfully.")

if __name__ == "__main__":
    build_compact_aatamaker()

