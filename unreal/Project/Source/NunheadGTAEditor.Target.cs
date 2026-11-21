using UnrealBuildTool;
public class NunheadGTAEditorTarget : TargetRules
{
    public NunheadGTAEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("NunheadGTA");
    }
}
