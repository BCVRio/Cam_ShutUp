"""Create the NunheadGTA Unreal project on this machine (Windows, no Unreal needed to run this).
    python create_project.py F:\\NunheadGTA
Makes the .uproject (Third Person-style blank project with the Python plugin on, Lumen defaults), copies the
level build script and the Nunhead Green GLB next to it, and writes OpenAndBuild.bat which launches the editor
and builds the level in one go. Then double-click OpenAndBuild.bat (or open the .uproject and run build_green.py
from the Output Log with Cmd set to Python)."""
import json, os, shutil, sys, glob

dest = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else r'F:\NunheadGTA')
name = os.path.basename(dest)
here = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(dest, 'Config'), exist_ok=True)
os.makedirs(os.path.join(dest, 'Content'), exist_ok=True)

uproject = {
    'FileVersion': 3, 'EngineAssociation': '5.4', 'Category': '', 'Description': 'Nunhead GTA: Cam\'s Shut Up SE London in Unreal',
    'Plugins': [
        {'Name': 'PythonScriptPlugin', 'Enabled': True},
        {'Name': 'Interchange', 'Enabled': True},
        {'Name': 'InterchangeEditor', 'Enabled': True},
        {'Name': 'GLTFExporter', 'Enabled': False},
    ],
}
# use the newest installed engine if we can see one
eng = sorted(glob.glob(r'C:\Program Files\Epic Games\UE_5.*'))
if eng: uproject['EngineAssociation'] = os.path.basename(eng[-1]).replace('UE_', '')
with open(os.path.join(dest, name + '.uproject'), 'w') as f: json.dump(uproject, f, indent=2)

with open(os.path.join(dest, 'Config', 'DefaultEngine.ini'), 'w') as f:
    f.write('''[/Script/Engine.RendererSettings]
r.DynamicGlobalIlluminationMethod=1
r.ReflectionMethod=1
r.Lumen.HardwareRayTracing=0
r.GenerateMeshDistanceFields=True
r.Nanite.ProjectEnabled=True
r.VirtualTextures=True
r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange=True
r.AntiAliasingMethod=4
r.SkinCache.CompileShaders=True
r.RayTracing=False

[/Script/Engine.Engine]
+ActiveGameNameRedirects=(OldGameName="TP_ThirdPerson",NewGameName="/Script/%s")
''' % name)
with open(os.path.join(dest, 'Config', 'DefaultGame.ini'), 'w') as f:
    f.write('[/Script/EngineSettings.GeneralProjectSettings]\nProjectName=Nunhead GTA\nProjectID=4D5E6F70A1B2C3D4E5F60718\n')

for fn in ['build_green.py', 'nunhead_green.glb']:
    src = os.path.join(here, fn)
    if os.path.exists(src): shutil.copy2(src, os.path.join(dest, fn)); print('copied', fn)
    else: print('MISSING', fn, '- pull the latest cam-shutup-game branch')

editor = ''
for e in reversed(eng):
    cand = os.path.join(e, 'Engine', 'Binaries', 'Win64', 'UnrealEditor.exe')
    if os.path.exists(cand): editor = cand; break
with open(os.path.join(dest, 'OpenAndBuild.bat'), 'w') as f:
    f.write('@echo off\r\n')
    f.write('set EDITOR=%s\r\n' % (editor or r'C:\Program Files\Epic Games\UE_5.4\Engine\Binaries\Win64\UnrealEditor.exe'))
    f.write('echo Opening the project and building the Nunhead Green level (first run compiles shaders: give it a few minutes)...\r\n')
    f.write('"%%EDITOR%%" "%s" -ExecutePythonScript="%s"\r\n' % (os.path.join(dest, name + '.uproject'), os.path.join(dest, 'build_green.py')))
print('project written to', dest)
print('editor:', editor or 'not found under C:\\Program Files\\Epic Games (edit EDITOR in OpenAndBuild.bat)')
print('next: double-click', os.path.join(dest, 'OpenAndBuild.bat'))
