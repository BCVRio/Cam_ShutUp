"""Build the Nunhead Green level: run inside the editor with the NunheadGTA project open
(Output Log, Cmd set to Python):   py "<repo>/unreal/build_green.py"
or headless:  UnrealEditor-Cmd <project> -run=pythonscript -script="<repo>/unreal/build_green.py"
Imports unreal/nunhead_green.glb (the street scene exported from the browser game) and Cam's models, lights it,
grows grass on the Green, drops the ball, goals, team-mates and Rovers onto it and saves /Game/Nunhead/NunheadGreen.
Set EVENING=1 in the environment for the golden-hour version, NANITE=0 to leave Nanite off, GRASS=0 for no grass,
MATERIALS=0 to keep the export's own (downsized) textures instead of the shared full-size street materials."""
import unreal, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
def find_repo(start):   # the script may be copied next to the project; walk up to the repo (has public/models)
    d = start
    for _ in range(5):
        if os.path.isdir(os.path.join(d, 'public', 'models')): return d
        d = os.path.dirname(d)
    return os.path.dirname(start)
REPO = find_repo(HERE)
GLB = os.path.join(HERE, 'nunhead_green.glb')
GRASS_GLB = os.path.join(HERE, 'grass_card.glb')
MODELS = os.path.join(REPO, 'public', 'models')
AUDIO = os.path.join(REPO, 'unreal', 'audio')
LEVEL = '/Game/Nunhead/NunheadGreen'
RUN_SPEED = 650.0      # cm/s at which the run clip plays at full weight in the blend spaces
log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()

def import_file(path, dest):
    if not os.path.exists(path): log('missing ' + path); return []
    t = unreal.AssetImportTask(); t.filename = path; t.destination_path = dest; t.replace_existing = True; t.automated = True; t.save = True
    tools.import_asset_tasks([t])
    paths = list(t.imported_object_paths)
    if not paths: paths = [p for p in unreal.EditorAssetLibrary.list_assets(dest, recursive=True)]   # some Interchange versions report nothing
    log('imported %d from %s: %s' % (len(paths), os.path.basename(path), ', '.join(p.split('/')[-1] for p in paths[:12]))); return paths

def make_blendspace(dest, base, mesh):
    """<base>_BS: a 1D blend space on the mesh's skeleton, idle at 0 and run at RUN_SPEED, so the characters blend
    between the two by speed instead of switching clips. Any failure just means the C++ falls back to switching."""
    path = '%s/%s_BS' % (dest, base)
    idle = unreal.load_asset('%s/%s_Anim_idle' % (dest, base)); run = unreal.load_asset('%s/%s_Anim_run' % (dest, base)) or unreal.load_asset('%s/%s_Anim_walk' % (dest, base))
    skel = mesh.get_editor_property('skeleton') if mesh else None
    if not (idle and run and skel): log('blend space %s: missing idle/run/skeleton' % base); return None
    try:
        bs = unreal.load_asset(path) if unreal.EditorAssetLibrary.does_asset_exist(path) else None   # a re-run refreshes the existing asset
        if bs is None:
            f = unreal.BlendSpaceFactory1D(); f.set_editor_property('target_skeleton', skel)
            bs = tools.create_asset(base + '_BS', dest, unreal.BlendSpace1D, f)
        if bs is None: log('blend space %s: create_asset failed' % base); return None
        p = unreal.BlendParameter(); p.set_editor_property('display_name', 'Speed'); p.set_editor_property('min', 0.0); p.set_editor_property('max', RUN_SPEED * 1.4); p.set_editor_property('grid_num', 4)
        try: bs.set_editor_property('blend_parameters', [p, unreal.BlendParameter(), unreal.BlendParameter()])
        except Exception as e:
            params = bs.get_editor_property('blend_parameters'); params[0] = p; bs.set_editor_property('blend_parameters', params); log('blend parameters set via fixed array (%s)' % e)
        def sample(anim, x):
            s = unreal.BlendSample(); s.set_editor_property('animation', anim); s.set_editor_property('sample_value', unreal.Vector(x, 0, 0)); s.set_editor_property('rate_scale', 1.0); return s
        bs.set_editor_property('sample_data', [sample(idle, 0.0), sample(run, RUN_SPEED)])
        unreal.EditorAssetLibrary.save_loaded_asset(bs)
        log('blend space %s: %d samples' % (path, len(bs.get_editor_property('sample_data')))); return bs
    except Exception as e:
        log('blend space %s failed: %s' % (base, e)); return None

def import_character(path, dest, base):
    # deterministic names: <base> for the skeletal mesh, <base>_Anim_<idle|run|walk|jump|dance> for the clips, <base>_BS the blend space
    paths = import_file(path, dest); out = []; mesh = None
    for p in paths:
        a = unreal.load_asset(p)
        if a is None: continue
        n = a.get_name().lower(); newp = None
        if isinstance(a, unreal.SkeletalMesh): newp = '%s/%s' % (dest, base); mesh = a
        elif isinstance(a, unreal.AnimSequence):
            for key in ('idle', 'run', 'walk', 'jump', 'dance'):
                if key in n: newp = '%s/%s_Anim_%s' % (dest, base, key); break
        if newp and newp != p.split('.')[0]:
            try: unreal.EditorAssetLibrary.rename_asset(p, newp); out.append(newp)
            except Exception as e: log('rename %s: %s' % (p, e))
    log('character %s: %s' % (base, out))
    make_blendspace(dest, base, mesh or unreal.load_asset('%s/%s' % (dest, base)))
    return paths

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

# ---------------------------------------------------------------------------------------------------------------------
# Street materials: the export carries one downsized copy of its texture per object (many at 256 or 512, none above
# 1024). Every brick, facade, slate, pavement and tarmac slot is pointed at one shared instance of M_Street built from
# the full-size source textures in public/textures (facades at 2048, with normal and roughness maps), plus a fine
# detail normal layered on top so surfaces keep grain when Cam stands next to them.
TEXTURES = os.path.join(REPO, 'public', 'textures')
DETAIL_PNG = os.path.join(HERE, 'detail_normal.png')
MAT_DIR = '/Game/Nunhead/Materials'
TEX_DIR = '/Game/Nunhead/Textures'
# family -> (detail tiling, detail strength); the facades keep their windows crisp with a light touch of grain
STREET_FAMILIES = {'brick': (10, 0.6), 'stone': (10, 0.6), 'slate': (10, 0.5), 'pavement': (8, 0.6), 'tarmac': (10, 0.7),
                   'concrete': (8, 0.5), 'grass': (6, 0.3), 'bark': (6, 0.4), 'facade_terrace': (12, 0.35),
                   'facade_victorian': (12, 0.35), 'facade_edwardian': (12, 0.35), 'facade_shop': (12, 0.35), 'facade_flats': (12, 0.35)}

def glb_material_factors(path):
    """name -> (base colour factor, roughness factor, alpha mode) for the first material of each name in the export."""
    import struct
    out = {}
    try:
        with open(path, 'rb') as f: d = f.read()
        n = struct.unpack_from('<I', d, 12)[0]; j = json.loads(d[20:20 + n])
        for m in j['materials']:
            nm = m.get('name')
            if nm and nm not in out:
                p = m.get('pbrMetallicRoughness', {})
                out[nm] = (p.get('baseColorFactor', [1, 1, 1, 1]), p.get('roughnessFactor', 1.0), m.get('alphaMode', 'OPAQUE'))
    except Exception as e: log('glb factors: %s' % e)
    return out

def import_texture(path, kind):
    """kind: color (sRGB), normal (OpenGL maps from the browser: flip green for Unreal), mask (linear roughness)."""
    tex = None
    for p in import_file(path, TEX_DIR):
        a = unreal.load_asset(p)
        if isinstance(a, unreal.Texture2D): tex = a; break
    if tex is None: return None
    try:
        if kind == 'normal':
            tex.set_editor_property('srgb', False); tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_NORMALMAP)
            tex.set_editor_property('flip_green_channel', True)
        elif kind == 'mask':
            tex.set_editor_property('srgb', False); tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_MASKS)
        else: tex.set_editor_property('srgb', True)
        unreal.EditorAssetLibrary.save_loaded_asset(tex)
    except Exception as e: log('texture %s: %s' % (os.path.basename(path), e))
    return tex

def street_master(defaults):
    """M_Street: Base * Tint -> base colour, Rough.R * RoughScale -> roughness, Normal blended with a tiled Detail normal
    (BlendAngleCorrectedNormals) -> normal. Rebuilt from scratch on every run."""
    mel = unreal.MaterialEditingLibrary
    path = MAT_DIR + '/M_Street'
    mat = unreal.load_asset(path) if unreal.EditorAssetLibrary.does_asset_exist(path) else tools.create_asset('M_Street', MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())
    mel.delete_all_material_expressions(mat)
    def tex_param(name, kind, x, y):
        n = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
        n.set_editor_property('parameter_name', name)
        n.set_editor_property('sampler_type', {'color': unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, 'normal': unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, 'mask': unreal.MaterialSamplerType.SAMPLERTYPE_MASKS}[kind])
        n.set_editor_property('texture', defaults[name]); return n
    def scalar(name, val, x, y):
        n = mel.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, x, y); n.set_editor_property('parameter_name', name); n.set_editor_property('default_value', val); return n
    base = tex_param('Base', 'color', -700, -300)
    tint = mel.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, -700, -100); tint.set_editor_property('parameter_name', 'Tint'); tint.set_editor_property('default_value', unreal.LinearColor(1, 1, 1, 1))
    mul = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -350, -250)
    mel.connect_material_expressions(base, 'RGB', mul, 'A'); mel.connect_material_expressions(tint, '', mul, 'B'); mel.connect_material_property(mul, '', unreal.MaterialProperty.MP_BASE_COLOR)
    rough = tex_param('Rough', 'mask', -700, 100); rs = scalar('RoughScale', 1.0, -700, 300)
    rmul = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -350, 150)
    mel.connect_material_expressions(rough, 'R', rmul, 'A'); mel.connect_material_expressions(rs, '', rmul, 'B'); mel.connect_material_property(rmul, '', unreal.MaterialProperty.MP_ROUGHNESS)
    metal = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -350, 300); metal.set_editor_property('r', 0.0); mel.connect_material_property(metal, '', unreal.MaterialProperty.MP_METALLIC)
    nrm = tex_param('Normal', 'normal', -700, 500)
    uv = mel.create_material_expression(mat, unreal.MaterialExpressionTextureCoordinate, -1300, 750)
    tiling = scalar('DetailTiling', 8.0, -1300, 900)
    uvmul = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -1050, 800)
    mel.connect_material_expressions(uv, '', uvmul, 'A'); mel.connect_material_expressions(tiling, '', uvmul, 'B')
    detail = tex_param('Detail', 'normal', -700, 750); mel.connect_material_expressions(uvmul, '', detail, 'UVs')
    flat = mel.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -700, 1000); flat.set_editor_property('constant', unreal.LinearColor(0, 0, 1, 1))
    strength = scalar('DetailStrength', 0.5, -700, 1150)
    lerp = mel.create_material_expression(mat, unreal.MaterialExpressionLinearInterpolate, -450, 850)
    mel.connect_material_expressions(flat, '', lerp, 'A'); mel.connect_material_expressions(detail, 'RGB', lerp, 'B'); mel.connect_material_expressions(strength, '', lerp, 'Alpha')
    blend = mel.create_material_expression(mat, unreal.MaterialExpressionMaterialFunctionCall, -200, 600)
    fn = unreal.load_asset('/Engine/Functions/Engine_MaterialFunctions02/Utility/BlendAngleCorrectedNormals')
    if fn:
        blend.set_editor_property('material_function', fn)
        mel.connect_material_expressions(nrm, 'RGB', blend, 'BaseNormal'); mel.connect_material_expressions(lerp, '', blend, 'AdditionalNormal')
        mel.connect_material_property(blend, '', unreal.MaterialProperty.MP_NORMAL)
    else:
        log('BlendAngleCorrectedNormals not found: plain normal map'); mel.connect_material_property(nrm, 'RGB', unreal.MaterialProperty.MP_NORMAL)
    mel.recompile_material(mat); unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat

def materials(paths):
    if os.environ.get('MATERIALS', '1') != '1' or not os.path.isdir(TEXTURES): log('street materials skipped'); return
    import re
    mel = unreal.MaterialEditingLibrary
    factors = glb_material_factors(GLB)
    detail = import_texture(DETAIL_PNG, 'normal') if os.path.exists(DETAIL_PNG) else None
    sets = {}
    for fam in STREET_FAMILIES:
        if factors.get(fam, (None, None, 'OPAQUE'))[2] != 'OPAQUE': log('%s: not opaque in the export, keeping its import material' % fam); continue
        files = [os.path.join(TEXTURES, fam + s + '.jpg') for s in ('', '_n', '_r')]
        if not all(os.path.exists(f) for f in files): log('%s: source textures missing, keeping the import' % fam); continue
        sets[fam] = (import_texture(files[0], 'color'), import_texture(files[1], 'normal'), import_texture(files[2], 'mask'))
    if not sets or detail is None: log('street materials: nothing to build'); return
    first = next(iter(sets.values()))
    master = street_master({'Base': first[0], 'Normal': first[1], 'Rough': first[2], 'Detail': detail})
    instances = {}
    for fam, (b, n, r) in sets.items():
        if not (b and n and r): continue
        name = 'MI_' + fam; path = MAT_DIR + '/' + name
        mi = unreal.load_asset(path) if unreal.EditorAssetLibrary.does_asset_exist(path) else tools.create_asset(name, MAT_DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        mel.set_material_instance_parent(mi, master)
        for pname, tex in (('Base', b), ('Normal', n), ('Rough', r), ('Detail', detail)): mel.set_material_instance_texture_parameter_value(mi, pname, tex)
        bcf, rf, _ = factors.get(fam, ([1, 1, 1, 1], 1.0, 'OPAQUE'))
        mel.set_material_instance_vector_parameter_value(mi, 'Tint', unreal.LinearColor(bcf[0], bcf[1], bcf[2], 1.0))
        mel.set_material_instance_scalar_parameter_value(mi, 'RoughScale', float(rf))
        mel.set_material_instance_scalar_parameter_value(mi, 'DetailTiling', float(STREET_FAMILIES[fam][0]))
        mel.set_material_instance_scalar_parameter_value(mi, 'DetailStrength', float(STREET_FAMILIES[fam][1]))
        mel.update_material_instance(mi); unreal.EditorAssetLibrary.save_loaded_asset(mi); instances[fam] = mi
    slots = 0; meshes = 0
    for p in paths:
        a = unreal.load_asset(p)
        if not isinstance(a, unreal.StaticMesh): continue
        hit = False
        for i, sm in enumerate(a.get_editor_property('static_materials')):
            m = sm.material_interface
            if m is None: continue
            fam = re.sub(r'\d+$', '', m.get_name())     # brick, brick1 .. brick74 -> brick
            if fam in instances: a.set_material(i, instances[fam]); slots += 1; hit = True
        if hit: meshes += 1
    log('street materials: %d instances from full-size textures on %d slots of %d meshes' % (len(instances), slots, meshes))

def spawn(cls, loc=(0, 0, 0), rot=(0, 0, 0), label=None):   # rot is (pitch, yaw, roll)
    a = unreal.EditorLevelLibrary.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(roll=rot[2], pitch=rot[0], yaw=rot[1]))
    if label and a: a.set_actor_label(label)
    return a

def place_scene(paths):
    n = 0; placed = {}
    for p in paths:
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            act = unreal.EditorLevelLibrary.spawn_actor_from_object(a, unreal.Vector(0, 0, 0))
            if act: act.set_actor_label(a.get_name()); act.set_folder_path('Nunhead/Street'); placed[a.get_name()] = act; n += 1
    log('placed %d street meshes' % n); return placed

def grass(placed):
    """A GrassField over the Green's grass surface (the export's map_mesh_0, material 'grass'): the clump mesh from
    grass_card.glb with a masked, two-sided material built here, scattered by the C++ actor with line traces."""
    if os.environ.get('GRASS', '1') != '1': return
    surface = placed.get('map_mesh_0') or next((a for n, a in placed.items() if n.startswith('map_mesh_0')), None)
    if surface is None: log('grass: no map_mesh_0 surface in the export'); return
    paths = import_file(GRASS_GLB, '/Game/Nunhead/Foliage')
    mesh = tex = None
    for p in paths:
        a = unreal.load_asset(p)
        if isinstance(a, unreal.StaticMesh): mesh = a
        elif isinstance(a, unreal.Texture2D): tex = a
    if mesh is None: log('grass: clump mesh did not import'); return
    if tex is None:   # Interchange reports only the mesh; the texture lands in <dest>/grass_card/Textures
        for p in unreal.EditorAssetLibrary.list_assets('/Game/Nunhead/Foliage', recursive=True):
            a = unreal.load_asset(p)
            if isinstance(a, unreal.Texture2D): tex = a; break
    if tex is None: log('grass: no blade texture found under /Game/Nunhead/Foliage, keeping the import material')
    try:
        if tex is None: raise RuntimeError('no texture')
        mel = unreal.MaterialEditingLibrary
        mpath = '/Game/Nunhead/Foliage/M_GrassCard'
        if unreal.EditorAssetLibrary.does_asset_exist(mpath): unreal.EditorAssetLibrary.delete_asset(mpath)
        mat = tools.create_asset('M_GrassCard', '/Game/Nunhead/Foliage', unreal.Material, unreal.MaterialFactoryNew())
        mat.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED); mat.set_editor_property('two_sided', True); mat.set_editor_property('opacity_mask_clip_value', 0.45)
        mat.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
        ts = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -500, 0); ts.set_editor_property('texture', tex); ts.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
        mel.connect_material_property(ts, 'RGB', unreal.MaterialProperty.MP_BASE_COLOR); mel.connect_material_property(ts, 'A', unreal.MaterialProperty.MP_OPACITY_MASK)
        rough = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -500, 300); rough.set_editor_property('r', 0.85); mel.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)
        sss = mel.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -500, 450); sss.set_editor_property('constant', unreal.LinearColor(0.35, 0.6, 0.12, 1)); mel.connect_material_property(sss, '', unreal.MaterialProperty.MP_SUBSURFACE_COLOR)
        # a breeze: world position offset sways the tops of the blades (the texture's V runs 1 at the root to 0 at the tip)
        wpo = mel.create_material_expression(mat, unreal.MaterialExpressionMaterialFunctionCall, -500, 650)
        fn = unreal.load_asset('/Engine/Functions/Engine_MaterialFunctions01/WorldPositionOffset/SimpleGrassWind')
        if fn:
            wpo.set_editor_property('material_function', fn)
            for name, val in (('WindIntensity', 1.0), ('WindWeight', 1.0), ('WindSpeed', 1.0)):
                c = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -800, 650 + 80 * ['WindIntensity', 'WindWeight', 'WindSpeed'].index(name)); c.set_editor_property('r', val); mel.connect_material_expressions(c, '', wpo, name)
            zero = mel.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -800, 900); zero.set_editor_property('constant', unreal.LinearColor(0, 0, 0, 0))
            mel.connect_material_expressions(zero, '', wpo, 'AdditionalWPO')   # every function input must be fed or the material fails to compile
            mel.connect_material_property(wpo, '', unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
        mel.recompile_material(mat)
        mesh.set_material(0, mat)
        unreal.EditorAssetLibrary.save_loaded_asset(mat); unreal.EditorAssetLibrary.save_loaded_asset(mesh)
    except Exception as e: log('grass material: %s (the import\'s own material stays)' % e)
    field = spawn(unreal.load_class(None, '/Script/NunheadGTA.GrassField'), (0, 0, 0), label='Grass')
    field.set_folder_path('Nunhead/Foliage')
    cx, cy = pitch_centre(placed)   # the pitch itself stays mown
    field.set_editor_property('clear_centre', unreal.Vector(cx, cy, 0)); field.set_editor_property('clear_half_extent', unreal.Vector2D(2700, 2300))
    n = field.scatter(surface, mesh)
    log('grass: %d clumps' % n)

def lighting(evening):
    try:   # Lumen lights everything live: no lightmaps, no "lighting needs to be rebuilt"
        unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world().get_world_settings().set_editor_property('force_no_precomputed_lighting', True)
    except Exception as e: log('world settings: %s' % e)
    sun = spawn(unreal.DirectionalLight, (0, 0, 2000), (-9 if evening else -38, 60 if evening else 35, 0), 'Sun')
    c = sun.light_component; c.set_mobility(unreal.ComponentMobility.MOVABLE); c.set_intensity(5.0 if evening else 8.0)
    c.set_light_color(unreal.LinearColor(1.0, 0.65, 0.38) if evening else unreal.LinearColor(1.0, 0.95, 0.88))
    c.set_editor_property('atmosphere_sun_light', True); c.set_editor_property('light_source_angle', 0.6)
    rt_shadow = getattr(getattr(unreal, 'CastRayTracedShadow', None), 'ENABLED', None)
    for name, val in (('enable_light_shaft_bloom', True), ('bloom_scale', 0.2), ('contact_shadow_length', 0.05), ('cast_volumetric_shadow', True),
                      ('cast_raytraced_shadow', rt_shadow), ('cast_cloud_shadows', True), ('cloud_shadow_strength', 0.7), ('cast_shadows_on_clouds', True)):
        if val is None: continue
        try: c.set_editor_property(name, val)
        except Exception as e: log('sun %s: %s' % (name, e))
    sky = spawn(unreal.SkyLight, (0, 0, 2000), label='SkyLight'); sky.light_component.set_mobility(unreal.ComponentMobility.MOVABLE); sky.light_component.set_editor_property('real_time_capture', True)
    spawn(unreal.SkyAtmosphere, label='Atmosphere')
    fog = spawn(unreal.ExponentialHeightFog, label='Fog'); fog.component.set_editor_property('fog_density', 0.03 if evening else 0.012); fog.component.set_editor_property('fog_height_falloff', 0.3); fog.component.set_editor_property('enable_volumetric_fog', True)
    spawn(unreal.VolumetricCloud, label='Clouds')
    pp = spawn(unreal.PostProcessVolume, label='Look'); pp.set_editor_property('unbound', True)
    s = pp.settings
    def ov(name, val):
        try: s.set_editor_property('override_' + name, True); s.set_editor_property(name, val)
        except Exception as e: log('post %s: %s' % (name, e))
    ov('auto_exposure_method', unreal.AutoExposureMethod.AEM_MANUAL); ov('auto_exposure_bias', 11.5 if evening else 10.5)
    ov('vignette_intensity', 0.35); ov('film_grain_intensity', 0.2)
    # Lumen at its best on an RTX card: detail and final gather quality up, reflections sharper
    ov('lumen_scene_detail', 2.0); ov('lumen_scene_lighting_quality', 2.0); ov('lumen_final_gather_quality', 2.0); ov('lumen_reflection_quality', 2.0)
    ov('bloom_intensity', 0.35); ov('lens_flare_intensity', 0.06); ov('scene_fringe_intensity', 0.35); ov('motion_blur_amount', 0.0)
    # ray-traced reflections: Lumen hit lighting (lights evaluated at the hit instead of the surface cache), two bounces
    hit = getattr(getattr(unreal, 'LumenRayLightingModeOverride', None), 'HIT_LIGHTING', None)
    if hit is not None: ov('lumen_ray_lighting_mode', hit)
    ov('lumen_max_reflection_bounces', 2); ov('lumen_max_refraction_bounces', 1); ov('lumen_front_layer_translucency_reflections', True)
    ov('local_exposure_highlight_contrast_scale', 0.8); ov('local_exposure_shadow_contrast_scale', 0.8); ov('local_exposure_detail_strength', 1.0)
    pp.set_editor_property('settings', s)

def ground_z(x, y, default=0.0):
    """Height of the placed street meshes under (x, y), by a line trace in the editor world; the Green is not at Z = 0."""
    try:
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        r = unreal.SystemLibrary.line_trace_single(world, unreal.Vector(x, y, 20000), unreal.Vector(x, y, -20000), unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [], unreal.DrawDebugTrace.NONE, True)
        if isinstance(r, tuple): r = r[1] if r[0] else None
        if r is None: log('ground_z(%.0f, %.0f): nothing under it, using %.0f' % (x, y, default)); return default
        # (blocking_hit, initial_overlap, time, distance, location, impact_point, ...): the struct's fields are protected to Python
        parts = unreal.GameplayStatics.break_hit_result(r) if hasattr(unreal.GameplayStatics, 'break_hit_result') else r.to_tuple()
        if not parts[0]: log('ground_z(%.0f, %.0f): no blocking hit, using %.0f' % (x, y, default)); return default
        return float(parts[4].z)
    except Exception as e: log('ground_z(%s, %s): %s' % (x, y, e)); return default

def pitch_centre(placed):
    """The middle of Nunhead Green in level coordinates. find_pitch.py measured it in the export's metres / Y-up frame
    (pitch.json); the placed grass actor's bounds tell which way Interchange turned the glTF Z axis."""
    cx, cy, cz = -294.0, 17.3, 412.0
    pj = os.path.join(HERE, 'pitch.json')
    if os.path.exists(pj):
        with open(pj) as f: cx, cy, cz = json.load(f)['centre_gltf']
    sign = -1.0
    surface = placed.get('map_mesh_0')
    if surface:
        o, e = surface.get_actor_bounds(False)
        sign = 1.0 if abs(o.y - cz * 100) < abs(o.y + cz * 100) else -1.0
        log('grass bounds centre (%.0f, %.0f, %.0f) extent (%.0f, %.0f, %.0f)' % (o.x, o.y, o.z, e.x, e.y, e.z))
    return cx * 100.0, sign * cz * 100.0

def gameplay(placed):
    # the pitch runs along X across the middle of the Green: Rovers defend +X, Bosco defend -X; everything sits on the traced ground
    cls = lambda n: unreal.load_class(None, '/Script/NunheadGTA.' + n)
    Goal, Ball, Bot, Team, Role = cls('Goal'), cls('Football'), cls('BotPlayer'), unreal.Team, unreal.BotRole   # Python drops the E prefix of UENUMs
    L = 2000.0
    CX, CY = pitch_centre(placed)
    def at(x, y, up=0.0): return (CX + x, CY + y, ground_z(CX + x, CY + y, default=1730.0) + up)
    log('pitch centre (%.0f, %.0f): ground Z = %.0f, goal lines: %.0f / %.0f' % (CX, CY, at(0, 0)[2], at(L, 0)[2], at(-L, 0)[2]))
    g1 = spawn(Goal, at(L, 0), (0, 180, 0), 'Goal_RoversDefend'); g1.set_editor_property('defending_team', Team.AWAY)
    g2 = spawn(Goal, at(-L, 0), (0, 0, 0), 'Goal_BoscoDefend'); g2.set_editor_property('defending_team', Team.HOME)
    spawn(Ball, at(0, 0, 40), label='Ball')
    spawn(unreal.PlayerStart, at(-400, 150, 120), (0, 0, 0), 'Start')
    def bot(x, y, team, role, label):
        b = spawn(Bot, at(x, y, 100), (0, 180 if team == Team.AWAY else 0, 0), label)
        b.set_editor_property('team', team); b.set_editor_property('bot_role', role); b.set_folder_path('Nunhead/Players')
    bot(-L + 120, 0, Team.HOME, Role.KEEPER, 'Bosco_Keeper'); bot(-600, 500, Team.HOME, Role.OUTFIELD, 'Bosco_Mate1'); bot(-600, -500, Team.HOME, Role.OUTFIELD, 'Bosco_Mate2'); bot(-250, 0, Team.HOME, Role.OUTFIELD, 'Bosco_Mate3')
    bot(L - 120, 0, Team.AWAY, Role.KEEPER, 'Rovers_Keeper'); bot(400, 400, Team.AWAY, Role.OUTFIELD, 'Rovers_1'); bot(400, -400, Team.AWAY, Role.OUTFIELD, 'Rovers_2'); bot(900, 700, Team.AWAY, Role.OUTFIELD, 'Rovers_3'); bot(900, -700, Team.AWAY, Role.OUTFIELD, 'Rovers_4')
    try:
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        world.get_world_settings().set_editor_property('default_game_mode', cls('NunheadGameMode'))
    except Exception as e: log('game mode: %s' % e)

def audio():
    for n in ['shutup_1', 'shutup_2', 'shutup_3', 'yay', 'ooh', 'ohyeah', 'ohno', 'woohoo', 'ref_whistle', 'crowd_stadium_loop', 'crowd_stadium_goal', 'crowd_stadium_groan', 'crowd_kids_cheer']:
        import_file(os.path.join(AUDIO, n + '.wav'), '/Game/Nunhead/Audio')
    loop = unreal.load_asset('/Game/Nunhead/Audio/crowd_stadium_loop')
    if loop:
        try: loop.set_editor_property('looping', True); unreal.EditorAssetLibrary.save_loaded_asset(loop)
        except Exception as e: log('crowd loop: %s' % e)

if __name__ == '__main__':
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if unreal.EditorAssetLibrary.does_asset_exist(LEVEL):
        # re-run: reuse the level, emptied (deleting a map from Python leaves its file on disk, and new_level then refuses the path)
        les.load_level(LEVEL)
        actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        n = sum(1 for a in actors.get_all_level_actors() if actors.destroy_actor(a)); log('cleared %d actors from %s' % (n, LEVEL))
    else: les.new_level(LEVEL)
    street = import_file(GLB, '/Game/Nunhead/Green'); tune_static_meshes(street); materials(street); placed = place_scene(street)
    import_character(os.path.join(MODELS, 'cam.glb'), '/Game/Nunhead/Cam', 'cam')
    for n in ['npc_boy_home', 'npc_boy_away', 'npc_boy_keeper']: import_character(os.path.join(MODELS, n + '.glb'), '/Game/Nunhead/Players', n)
    audio()
    lighting(os.environ.get('EVENING') == '1')
    gameplay(placed)
    grass(placed)
    les.save_current_level(); unreal.EditorAssetLibrary.save_directory('/Game/Nunhead', recursive=True)
    log('Nunhead Green built and saved: ' + LEVEL)
