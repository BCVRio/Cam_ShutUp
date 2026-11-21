#include "GrassField.h"
#include "NunheadGTA.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "CollisionQueryParams.h"

AGrassField::AGrassField()
{
	PrimaryActorTick.bCanEverTick = false;
	Grass = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("Grass"));
	RootComponent = Grass;
	Grass->SetMobility(EComponentMobility::Static);
	Grass->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Grass->SetCastShadow(true);
	Grass->bAffectDistanceFieldLighting = false;
	Grass->bAffectDynamicIndirectLighting = false;
}

int32 AGrassField::Scatter(AActor* Surface, UStaticMesh* ClumpMesh)
{
	if (!Surface || !ClumpMesh || !GetWorld()) { UE_LOG(LogNunhead, Warning, TEXT("GrassField::Scatter: needs a surface actor and a clump mesh")); return 0; }
	Grass->SetStaticMesh(ClumpMesh);
	Grass->ClearInstances();
	Grass->SetCullDistances(FMath::RoundToInt(CullStart), FMath::RoundToInt(CullEnd));
	FVector Origin, Extent; Surface->GetActorBounds(false, Origin, Extent);
	const float Step = 100.f / FMath::Sqrt(FMath::Max(0.01f, Density));   // cm between clumps for Density per m^2
	FRandomStream R(Seed);
	FCollisionQueryParams P(SCENE_QUERY_STAT(GrassScatter), false, this);
	TArray<FTransform> Placed; Placed.Reserve(FMath::Min(400000, int32((Extent.X * 2 / Step + 1) * (Extent.Y * 2 / Step + 1))));
	const float Top = Origin.Z + Extent.Z + 200.f, Drop = Extent.Z * 2.f + 400.f;
	for (float X = Origin.X - Extent.X; X <= Origin.X + Extent.X; X += Step)
		for (float Y = Origin.Y - Extent.Y; Y <= Origin.Y + Extent.Y; Y += Step)
		{
			const FVector Start(X + R.FRandRange(-Step * 0.5f, Step * 0.5f), Y + R.FRandRange(-Step * 0.5f, Step * 0.5f), Top);
			if (ClearHalfExtent.X > 0.f && FMath::Abs(Start.X - ClearCentre.X) < ClearHalfExtent.X && FMath::Abs(Start.Y - ClearCentre.Y) < ClearHalfExtent.Y) continue;   // the pitch stays mown
			FHitResult Hit;
			if (!GetWorld()->LineTraceSingleByChannel(Hit, Start, Start - FVector(0, 0, Drop), ECC_Visibility, P)) continue;
			if (Hit.GetActor() != Surface || Hit.ImpactNormal.Z < MaxSlope) continue;
			const float S = R.FRandRange(ScaleMin, ScaleMax);
			Placed.Add(FTransform(FRotator(0, R.FRandRange(0.f, 360.f), 0), Hit.ImpactPoint - FVector(0, 0, 2.f), FVector(S, S, S * R.FRandRange(0.8f, 1.25f))));
		}
	Grass->AddInstances(Placed, false, true, false);
	UE_LOG(LogNunhead, Log, TEXT("GrassField: %d clumps on %s"), Placed.Num(), *Surface->GetActorLabel());
	return Placed.Num();
}
