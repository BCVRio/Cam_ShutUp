"""Build the Nunhead Green test level in Unreal from the exported GLB.
Run inside the editor (Output Log, Cmd set to Python):  py "<repo>/unreal/build_green.py"
or from a shell:  UnrealEditor-Cmd.exe <project.uproject> -run=pythonscript -script="<repo>/unreal/build_green.py"
Imports unreal/nunhead_green.glb with Interchange, drops every mesh into a fresh level, adds sun, sky,
atmosphere, fog and clouds (Lumen is on by default in a 5.x project), saves the level and takes screenshots.
"""
import unreal, os, math

GLB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nunhead_green.glb')   # next to this script
DEST = '/Game/Nunhead/Green'
LEVEL = '/Game/Nunhead/NunheadGreen'
log = unreal.log

# --- import -----------------------------------------------------------------
def import_glb():
    task = unreal.AssetImportTask()
    task.filename = GLB
    task.destination_path = DEST
    task.replace_existing = True
    task.automated = True
    task.save = True
    # Interchange handles glTF in 5.x; the generic pipeline builds static meshes + materials from the file
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    log('imported: %d objects' % len(task.imported_object_paths))
    return list(task.imported_object_paths)

# --- level ------------------------------------------------------------------
def new_level():
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    les.new_level(LEVEL)
    return les

def spawn(cls, loc=(0, 0, 0), rot=(0, 0, 0), label=None):
    a = unreal.EditorLevelLibrary.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(*rot))
    if label: a.set_actor_label(label)
    return a

def lighting(evening=False):
    sun = spawn(unreal.DirectionalLight, (0, 0, 2000), (-38 if not evening else -9, 35 if not evening else 60, 0), 'Sun')
    c = sun.light_component
    c.set_intensity(8.0 if not evening else 5.0)
    c.set_light_color(unreal.LinearColor(1.0, 0.95, 0.88) if not evening else unreal.LinearColor(1.0, 0.65, 0.38))
    c.set_editor_property('atmosphere_sun_light', True)
    c.set_editor_property('light_source_angle', 0.6)
    sky = spawn(unreal.SkyLight, (0, 0, 2000), label='SkyLight')
    sky.light_component.set_editor_property('real_time_capture', True)
    spawn(unreal.SkyAtmosphere, (0, 0, 0), label='Atmosphere')
    fog = spawn(unreal.ExponentialHeightFog, (0, 0, 0), label='Fog')
    fog.component.set_editor_property('fog_density', 0.012 if not evening else 0.03)
    fog.component.set_editor_property('fog_height_falloff', 0.3)
    fog.component.set_editor_property('volumetric_fog', True)
    spawn(unreal.VolumetricCloud, (0, 0, 0), label='Clouds')
    pp = spawn(unreal.PostProcessVolume, (0, 0, 0), label='Look')
    pp.set_editor_property('unbound', True)
    s = pp.settings
    s.set_editor_property('override_auto_exposure_method', True)
    s.set_editor_property('auto_exposure_method', unreal.AutoExposureMethod.AEM_MANUAL)
    s.set_editor_property('override_auto_exposure_bias', True)
    s.set_editor_property('auto_exposure_bias', 10.5 if not evening else 11.5)
    s.set_editor_property('override_vignette_intensity', True); s.set_editor_property('vignette_intensity', 0.35)
    s.set_editor_property('override_film_grain_intensity', True); s.set_editor_property('film_grain_intensity', 0.25)
    pp.set_editor_property('settings', s)

def place_meshes(paths):
    # the GLB is in metres with Y up; Unreal is centimetres, Z up, left-handed. Interchange converts the meshes
    # themselves; actors keep their transforms from the file's scene graph, so we just place the scene root.
    n = 0
    for p in paths:
        asset = unreal.load_asset(p)
        if isinstance(asset, unreal.StaticMesh):
            a = unreal.EditorLevelLibrary.spawn_actor_from_object(asset, unreal.Vector(0, 0, 0))
            a.set_actor_label(asset.get_name()); n += 1
            comp = a.static_mesh_component
            comp.set_editor_property('cast_shadow', True)
    log('placed %d static meshes' % n)

def player_start():
    # Nunhead Green centre is the export origin; put the player start on the grass facing the houses
    spawn(unreal.PlayerStart, (0, 0, 120), (0, 0, 0), 'Start')

def screenshots(tag):
    cam = (2200, -1800, 320)
    unreal.AutomationLibrary.take_high_res_screenshot(1920, 1080, 'nunhead_%s.png' % tag, None, False, False, unreal.ComparisonTolerance.LOW, '', 0.0, True)

if __name__ == '__main__':
    paths = import_glb()
    new_level()
    place_meshes(paths)
    lighting(evening=os.environ.get('EVENING') == '1')
    player_start()
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
    unreal.EditorAssetLibrary.save_directory('/Game/Nunhead', recursive=True)
    log('level saved: ' + LEVEL)
