"""Build the Nunhead Green level: run inside the editor with the NunheadGTA project open
(Output Log, Cmd set to Python):   py "<repo>/unreal/build_green.py"
or headless:  UnrealEditor-Cmd <project> -run=pythonscript -script="<repo>/unreal/build_green.py"
Imports unreal/nunhead_green.glb (the street scene exported from the browser game) and Cam's models, lights it,
drops the ball, goals, team-mates and Rovers onto the Green and saves /Game/Nunhead/NunheadGreen.
Set EVENING=1 in the environment for the golden-hour version."""
import unreal, os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
GLB = os.path.join(HERE, 'nunhead_green.glb')
MODELS = os.path.join(REPO, 'public', 'models')
AUDIO = os.path.join(REPO, 'public', 'audio')
LEVEL = '/Game/Nunhead/NunheadGreen'
log = unreal.log

def import_file(path, dest):
    if not os.path.exists(path): log('missing ' + path); return []
    t = unreal.AssetImportTask(); t.filename = path; t.destination_path = dest; t.replace_existing = True; t.automated = True; t.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([t])
    paths = list(t.imported_object_paths); log('imported %d from %s' % (len(paths), os.path.basename(path))); return paths

def tune_static_meshes(paths):
    sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem) if hasattr(unreal, 'StaticMeshEditorSubsystem') else None
    n = 0
    for p in paths:
        a = unreal.load_asset(p)
        if not isinstance(a, unreal.StaticMesh): continue
        try:   # walkable, kickable: use the real triangles for collision
            bs = a.get_editor_property('body_setup')
            if bs: bs.set_editor_property('collision_trace_flag', unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
        except Exception as e: log('collision: %s' % e)
        try:
            if sms and os.environ.get('NANITE', '1') == '1':
                s = unreal.MeshNaniteSettings(); s.enabled = True; sms.set_nanite_settings(a, s, True)
        except Exception as e: log('nanite: %s' % e)
        n += 1
    log('tuned %d static meshes' % n)

def spawn(cls, loc=(0, 0, 0), rot=(0, 0, 0), label=None):
    a = unreal.EditorLevelLibrary.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(*rot))
    if label and a: a.set_actor_label(label)
    return a

def place_scene(paths):
    n = 0
    for p in paths:
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            act = unreal.EditorLevelLibrary.spawn_actor_from_object(a, unreal.Vector(0, 0, 0))
            if act: act.set_actor_label(a.get_name()); act.set_folder_path('Nunhead/Street'); n += 1
    log('placed %d street meshes' % n)

def lighting(evening):
    sun = spawn(unreal.DirectionalLight, (0, 0, 2000), (-9 if evening else -38, 60 if evening else 35, 0), 'Sun')
    c = sun.light_component; c.set_intensity(5.0 if evening else 8.0)
    c.set_light_color(unreal.LinearColor(1.0, 0.65, 0.38) if evening else unreal.LinearColor(1.0, 0.95, 0.88))
    c.set_editor_property('atmosphere_sun_light', True); c.set_editor_property('light_source_angle', 0.6)
    sky = spawn(unreal.SkyLight, (0, 0, 2000), label='SkyLight'); sky.light_component.set_editor_property('real_time_capture', True)
    spawn(unreal.SkyAtmosphere, label='Atmosphere')
    fog = spawn(unreal.ExponentialHeightFog, label='Fog'); fog.component.set_editor_property('fog_density', 0.03 if evening else 0.012); fog.component.set_editor_property('fog_height_falloff', 0.3); fog.component.set_editor_property('volumetric_fog', True)
    spawn(unreal.VolumetricCloud, label='Clouds')
    pp = spawn(unreal.PostProcessVolume, label='Look'); pp.set_editor_property('unbound', True)
    s = pp.settings
    s.set_editor_property('override_auto_exposure_method', True); s.set_editor_property('auto_exposure_method', unreal.AutoExposureMethod.AEM_MANUAL)
    s.set_editor_property('override_auto_exposure_bias', True); s.set_editor_property('auto_exposure_bias', 11.5 if evening else 10.5)
    s.set_editor_property('override_vignette_intensity', True); s.set_editor_property('vignette_intensity', 0.35)
    s.set_editor_property('override_film_grain_intensity', True); s.set_editor_property('film_grain_intensity', 0.25)
    pp.set_editor_property('settings', s)

def gameplay():
    # the pitch runs along X across the middle of the Green: Rovers defend +X, Bosco defend -X
    cls = lambda n: unreal.load_class(None, '/Script/NunheadGTA.' + n)
    Goal, Ball, Bot, Team, Role = cls('Goal'), cls('Football'), cls('BotPlayer'), unreal.ETeam if hasattr(unreal, 'ETeam') else None, unreal.EBotRole if hasattr(unreal, 'EBotRole') else None
    L = 2000.0
    g1 = spawn(Goal, (L, 0, 0), (0, 180, 0), 'Goal_RoversDefend'); g1.set_editor_property('defending_team', Team.AWAY)
    g2 = spawn(Goal, (-L, 0, 0), (0, 0, 0), 'Goal_BoscoDefend'); g2.set_editor_property('defending_team', Team.HOME)
    spawn(Ball, (0, 0, 40), label='Ball')
    spawn(unreal.PlayerStart, (-400, 150, 120), (0, 0, 0), 'Start')
    def bot(x, y, team, role, label):
        b = spawn(Bot, (x, y, 100), (0, 180 if team == Team.AWAY else 0, 0), label)
        b.set_editor_property('team', team); b.set_editor_property('role', role); b.set_folder_path('Nunhead/Players')
    bot(-L + 120, 0, Team.HOME, Role.KEEPER, 'Bosco_Keeper'); bot(-600, 500, Team.HOME, Role.OUTFIELD, 'Bosco_Mate1'); bot(-600, -500, Team.HOME, Role.OUTFIELD, 'Bosco_Mate2'); bot(-250, 0, Team.HOME, Role.OUTFIELD, 'Bosco_Mate3')
    bot(L - 120, 0, Team.AWAY, Role.KEEPER, 'Rovers_Keeper'); bot(400, 400, Team.AWAY, Role.OUTFIELD, 'Rovers_1'); bot(400, -400, Team.AWAY, Role.OUTFIELD, 'Rovers_2'); bot(900, 700, Team.AWAY, Role.OUTFIELD, 'Rovers_3'); bot(900, -700, Team.AWAY, Role.OUTFIELD, 'Rovers_4')
    try:
        for a in unreal.EditorLevelLibrary.get_all_level_actors():
            if isinstance(a, unreal.WorldSettings): a.set_editor_property('default_game_mode', cls('NunheadGameMode'))
    except Exception as e: log('game mode: %s' % e)

if __name__ == '__main__':
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    les.new_level(LEVEL)
    street = import_file(GLB, '/Game/Nunhead/Green'); tune_static_meshes(street); place_scene(street)
    import_file(os.path.join(MODELS, 'cam.glb'), '/Game/Nunhead/Cam')
    for n in ['npc_boy_home', 'npc_boy_away', 'npc_boy_keeper']: import_file(os.path.join(MODELS, n + '.glb'), '/Game/Nunhead/Players')
    for n in ['shutup_1', 'yay', 'ooh', 'ohyeah', 'crowd_stadium_loop', 'crowd_stadium_goal']: import_file(os.path.join(AUDIO, n + '.mp3'), '/Game/Nunhead/Audio')
    lighting(os.environ.get('EVENING') == '1')
    gameplay()
    les.save_current_level(); unreal.EditorAssetLibrary.save_directory('/Game/Nunhead', recursive=True)
    log('Nunhead Green built and saved: ' + LEVEL)
