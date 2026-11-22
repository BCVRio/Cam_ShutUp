"""Create the NunheadGTA Unreal project on this machine (Windows, no Unreal needed to run this).
    python create_project.py            (makes unreal\\NunheadGTA inside this repo)
    python create_project.py F:\\NunheadGTA   (or anywhere else)
Makes the .uproject (Third Person-style blank project with the Python plugin on, Lumen defaults), copies the
level build script, the Nunhead Green GLB and the grass clump next to it, and writes OpenAndBuild.bat which launches
the editor and builds the level in one go. Then double-click OpenAndBuild.bat (or open the .uproject and run
build_green.py from the Output Log with Cmd set to Python). Safe to re-run: it refreshes the copies."""
import json, os, shutil, sys, glob

here0 = os.path.dirname(os.path.abspath(__file__))
dest = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here0, 'NunheadGTA'))
name = 'NunheadGTA'   # the C++ module and targets are named NunheadGTA, so the project is too
here = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(dest, 'Content'), exist_ok=True)

# the C++ project template lives in unreal/Project: uproject, Source (game module), Config
tpl = os.path.join(here, 'Project')
for root, dirs, files in os.walk(tpl):
    rel = os.path.relpath(root, tpl); out = os.path.join(dest, rel) if rel != '.' else dest; os.makedirs(out, exist_ok=True)
    for fn in files: shutil.copy2(os.path.join(root, fn), os.path.join(out, fn))

def find_engines():
    """Every UE 5 install on this machine as (version, path): the Epic launcher's registry first (it knows about
    installs on any drive), then the default C:\\Program Files\\Epic Games folder."""
    found = []
    dat = os.path.join(os.environ.get('ProgramData', r'C:\ProgramData'), 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat')
    if os.path.exists(dat):
        try:
            with open(dat) as f: installs = json.load(f).get('InstallationList', [])
            for it in installs:
                app, loc = it.get('AppName', ''), it.get('InstallLocation', '')
                if app.startswith('UE_5') and os.path.isdir(loc): found.append((app[3:], loc))
        except Exception as e: print('could not read', dat, e)
    for e in glob.glob(r'C:\Program Files\Epic Games\UE_5.*'):
        v = os.path.basename(e)[3:]
        if not any(v == f[0] for f in found): found.append((v, e))
    return sorted(found, key=lambda f: [int(x) if x.isdigit() else 0 for x in f[0].split('.')])

# associate the project with the newest engine on this machine
eng = find_engines()
if eng:
    up = os.path.join(dest, name + '.uproject')
    with open(up) as f: j = json.load(f)
    j['EngineAssociation'] = eng[-1][0]
    with open(up, 'w') as f: json.dump(j, f, indent=2)
    print('engine:', eng[-1][0], 'at', eng[-1][1])
for fn in ['build_green.py', 'nunhead_green.glb', 'grass_card.glb', 'pitch.json', 'detail_normal.png', 'bird.glb']:
    src = os.path.join(here, fn)
    if os.path.exists(src): shutil.copy2(src, os.path.join(dest, fn)); print('copied', fn)
    else: print('MISSING', fn, '- pull the latest cam-shutup-game branch' + (' and run make_grass.py' if fn.startswith('grass') else ''))

editor = ''
for _, e in reversed(eng):
    cand = os.path.join(e, 'Engine', 'Binaries', 'Win64', 'UnrealEditor.exe')
    if os.path.exists(cand): editor = cand; break
with open(os.path.join(dest, 'OpenAndBuild.bat'), 'w') as f:
    f.write('@echo off\r\n')
    f.write('set EDITOR=%s\r\n' % (editor or r'C:\Program Files\Epic Games\UE_5.4\Engine\Binaries\Win64\UnrealEditor.exe'))
    f.write('echo Opening the project and building the Nunhead Green level (first run compiles shaders: give it a few minutes)...\r\n')
    f.write('"%%EDITOR%%" "%s" -ExecutePythonScript="%s"\r\n' % (os.path.join(dest, name + '.uproject'), os.path.join(dest, 'build_green.py')))
print('project written to', dest)
print('editor:', editor or 'no Unreal 5 install found (edit EDITOR in OpenAndBuild.bat)')
print('next: double-click', os.path.join(dest, 'OpenAndBuild.bat'))
