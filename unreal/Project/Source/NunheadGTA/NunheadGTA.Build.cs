using UnrealBuildTool;
public class NunheadGTA : ModuleRules
{
    public NunheadGTA(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput", "AIModule", "NavigationSystem", "PhysicsCore", "Json", "AssetRegistry" });
    }
}
