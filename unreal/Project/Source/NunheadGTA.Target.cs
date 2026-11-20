using UnrealBuildTool;
public class NunheadGTATarget : TargetRules
{
    public NunheadGTATarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("NunheadGTA");
    }
}
